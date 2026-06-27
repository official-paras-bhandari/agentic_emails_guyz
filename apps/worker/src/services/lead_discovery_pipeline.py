"""
LeadDiscoveryPipeline — the main orchestrator for the lead discovery system.
Implements the target-aware, queue-based orchestrator loop from Section 4.
"""

import time
import re
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urljoin, urlparse
import requests
from difflib import SequenceMatcher

from src.services.location_expansion_service import location_expander, location_scope_decider
from src.services.query_planner_service import QueryPlannerService
from src.services.ddg_searcher import DuckDuckGoSearcher
from src.services.search_result_normalizer import SearchResultNormalizer
from src.services.url_classifier_service import URLClassifierService
from src.services.website_cache_service import WebsiteCacheService, CacheEntry
from src.services.cheap_contact_extractor import CheapContactExtractor
from src.services.scrapegraph_fallback_extractor import ScrapeGraphFallbackExtractor
from src.services.lead_quality_gate import LeadQualityGate
from src.services.browser_pool import browser_pool
from src.services.directory_crawler import DirectoryCrawler
from src.services.normalization import normalize_business_name
from src.services.snapshot_store import snapshot_store
from src.config import config

class LeadDiscoveryPipeline:
    """Orchestrate the target-aware adaptive lead discovery pipeline."""

    def __init__(
        self,
        job_id: str,
        workspace_id: str,
        emit_event: Callable,
        save_lead: Callable,
        check_cancelled: Callable[[], bool],
        prompt: str = "",
    ):
        self.job_id = job_id
        self.workspace_id = workspace_id
        self.emit_event = emit_event
        self.save_lead = save_lead
        self.check_cancelled = check_cancelled
        self.prompt = prompt or f"Find leads in Sydney"

        # Services
        self.location_expander = location_expander
        self.query_planner = QueryPlannerService(max_queries=120)
        self.ddg_searcher = DuckDuckGoSearcher()
        self.url_classifier = URLClassifierService()
        self.website_cache = WebsiteCacheService()
        self.contact_extractor = CheapContactExtractor()
        self.fallback_extractor = ScrapeGraphFallbackExtractor()
        self.quality_gate = LeadQualityGate()
        self.directory_crawler = DirectoryCrawler(browser_pool, self._emit_internal_event)
        self.max_llm_fallback_calls = config.SCRAPEGRAPH_FALLBACK_MAX_CALLS

        # Queue state
        self.business_queue: List[Dict[str, Any]] = []
        self.directory_queue: List[Dict[str, Any]] = []
        self.unknown_queue: List[Dict[str, Any]] = []
        self.ignore_queue: List[str] = []

        # Duplication & tracking maps
        self.seen_domains: set[str] = set()
        self.discovered_leads: Dict[str, Dict[str, Any]] = {}  # {email: lead}
        self.discovered_domains: Dict[str, str] = {}  # {domain: email}
        self.discovered_phones: Dict[str, str] = {}  # {phone: email}
        self.discovered_names_suburbs: Dict[tuple, str] = {}  # {(name, suburb): email}
        self.discovered_names_addresses: Dict[tuple, str] = {}  # {(name, address): email}

        # Location & query expansion state
        self.scope = "exact_suburb"
        self.location_raw = ""
        self.country_raw = None
        self.city_data = {}
        self.active_locations = []
        self.pending_locations_expansion = []
        self.search_query_pool = []
        self.expanded_suburbs_approved = False

        # Metrics (Section 24)
        self.metrics = {
            "job_id": self.job_id,
            "target_quantity": 10,
            "valid_emails_saved": 0,
            "email_deficit": 10,
            "tier_a_count": 0,
            "tier_b_count": 0,
            "tier_c_count": 0,
            "queries_generated": 0,
            "queries_executed": 0,
            "search_results_found": 0,
            "unique_urls_found": 0,
            "unique_domains_found": 0,
            "business_queue_count": 0,
            "directory_queue_count": 0,
            "business_websites_crawled": 0,
            "directories_processed": 0,
            "directory_listings_found": 0,
            "directory_official_websites_found": 0,
            "emails_extracted": 0,
            "emails_mx_valid": 0,
            "duplicates_merged": 0,
            "llm_fallback_calls": 0,
            "cache_hits": 0,
            "cache_misses": 0
        }

    def run(self, industry: str, location: str, quantity: int = 10, country: Optional[str] = None) -> Dict[str, Any]:
        """Run the full adaptive orchestrator loop (Section 4.1)."""
        self.metrics["target_quantity"] = quantity
        self.metrics["email_deficit"] = quantity
        self.country_raw = country
        self.location_raw = self._format_location(location, country)

        self.emit_event(
            job_id=self.job_id, step="searching", status="running",
            message=f"Starting lead discovery: {industry} in {self.location_raw} (target: {quantity})",
        )

        # ── Step 1: Decide Scope & Expand Location ──────────────────────
        self.city_data = self.location_expander.expand(location)
        is_structured = self.city_data.get("structured", False)

        if not is_structured:
            self.scope = "generic"
            self.active_locations = [location]
            self.pending_locations_expansion = []
            
            # Formulate the query for fallback log
            query_loc = f"{location}, {country}" if country and str(country).lower() not in str(location).lower() else location
            fallback_query = f"{industry} in {query_loc}"
            
            self.emit_event(
                job_id=self.job_id, step="location_expansion", status="info",
                message=f"Structured location expansion fallback: no local database match for '{location}'. Falling back to generic web search using '{fallback_query}'.",
                scope=self.scope
            )
        else:
            self.scope = location_scope_decider.decide(self.prompt, location)
            self.emit_event(
                job_id=self.job_id, step="location_expansion", status="success",
                message=f"Location scope classified as '{self.scope}' for raw target: '{location}'",
                scope=self.scope
            )

            # Configure automatic vs requested expansion targets (Section 9)
            if self.scope == "exact_suburb":
                self.active_locations = [location]
                # Nearby suburbs are stored but not searched without approval (Section 9.1)
                city_suburbs = self.location_expander.get_proximity_groups(location, self.city_data)
                self.pending_locations_expansion = [sub for group in city_suburbs for sub in group]
            elif self.scope == "nearby":
                self.active_locations = [location]
                # Proximity-ordered list to expand automatically (Section 9.2)
                city_suburbs = self.location_expander.get_proximity_groups(location, self.city_data)
                self.pending_locations_expansion = [sub for group in city_suburbs for sub in group]
            elif self.scope == "metro":
                # Expand suburbs automatically from start (Section 9.3)
                suburbs = self.city_data.get("suburbs", [])
                if location in suburbs:
                    self.active_locations = [location] + [s for s in suburbs if s != location][:5]
                    self.pending_locations_expansion = [s for s in suburbs if s not in self.active_locations]
                else:
                    self.active_locations = suburbs[:6] if suburbs else [location]
                    self.pending_locations_expansion = suburbs[6:] if suburbs else []
            elif self.scope == "state":
                # Search major city centers of state
                self.active_locations = [location]
                self.pending_locations_expansion = ["Sydney CBD", "Melbourne CBD", "Brisbane CBD"]

        # Generate initial query pool
        self._generate_queries_for_locations(industry, self.active_locations)

        # ── Step 2: Main Orchestrator Loop (Section 4.1) ────────────────
        loop_counter = 0
        while self.metrics["valid_emails_saved"] < quantity:
            loop_counter += 1
            if loop_counter > 500: # Safety break
                break

            if self.check_cancelled():
                self.emit_event(job_id=self.job_id, step="cancelled", status="cancelled",
                                message="Pipeline cancelled by user.")
                break

            # A. Process business websites first
            if self.business_queue:
                self._crawl_business_websites_batch(industry)
                continue

            # B. Stop and report if target is met
            if self.metrics["valid_emails_saved"] >= quantity:
                break

            # C. Switch to Directories if BusinessQueue is empty, or yield is weak
            # (Expected yield rule: Section 4.4)
            deficit = quantity - self.metrics["valid_emails_saved"]
            expected_direct_yield = len(self.business_queue) * 0.35
            
            if self.directory_queue and (not self.business_queue or expected_direct_yield < deficit):
                self._process_directories_batch(industry)
                continue

            # D. Execute search queries if queues are low
            if self.search_query_pool:
                self._execute_search_query_batch()
                continue

            # E. Automatic location expansion if allowed (Section 4.1 & 9)
            if self.pending_locations_expansion and self.scope in {"nearby", "metro", "state"}:
                next_batch = self.pending_locations_expansion[:3]
                self.pending_locations_expansion = self.pending_locations_expansion[3:]
                self.active_locations.extend(next_batch)
                
                self.emit_event(
                    job_id=self.job_id, step="location_expansion", status="info",
                    message=f"Automatically expanding search to nearby locations: {', '.join(next_batch)}"
                )
                self._generate_queries_for_locations(industry, next_batch)
                continue

            # F. Exact Suburb exhausted -> prompt user for approval (Section 9.1 & 4.1)
            if self.scope == "exact_suburb" and self.pending_locations_expansion and not self.expanded_suburbs_approved:
                # We emit a recommendation report and break to simulate pause/complete
                rec_suburbs = self.pending_locations_expansion[:5]
                self.emit_event(
                    job_id=self.job_id, step="completed", status="success",
                    message=self._build_final_report(success=False, rec_suburbs=rec_suburbs)
                )
                return self.metrics

            # G. Exhausted all sources
            break

        # Finished loop
        success = self.metrics["valid_emails_saved"] >= quantity
        self.emit_event(
            job_id=self.job_id, step="completed", status="success",
            message=self._build_final_report(success=success)
        )
        return self.metrics

    # ─── Query Generation ────────────────────────────────────────────────

    def _generate_queries_for_locations(self, industry: str, locations: List[str]):
        """Generate targeted search queries for a list of locations."""
        for loc in locations:
            target = self._format_location(loc, self.country_raw) if self.country_raw and not self.city_data.get("country") else loc
            mock_expanded = {
                "city": self.city_data.get("city", target),
                "state": self.city_data.get("state"),
                "country": self.city_data.get("country") or self.country_raw,
                "suburbs": [target],
                "keywords": [],
                "search_targets": [target]
            }
            plan = self.query_planner.plan(industry, mock_expanded, quantity=self.metrics["target_quantity"])
            self.search_query_pool.extend(plan["queries"])
            self.metrics["queries_generated"] += len(plan["queries"])

    # ─── Queue Processing Methods ────────────────────────────────────────

    def _crawl_business_websites_batch(self, industry: str, batch_size: int = 4):
        """Process business websites from BusinessQueue using the BrowserPool."""
        batch = self.business_queue[:batch_size]
        self.business_queue = self.business_queue[batch_size:]

        self.emit_event(
            job_id=self.job_id, step="crawling", status="running",
            message=f"Crawling {len(batch)} business websites from BusinessQueue..."
        )

        for target in batch:
            if self.check_cancelled():
                return

            url = target["url"]
            domain = self._extract_domain(url)
            if not domain:
                continue

            self.emit_event(
                job_id=self.job_id, step="visiting_url", status="running",
                message=f"Crawling business website: {url}",
                website_url=url,
                business_name=target.get("business_name")
            )

            # 1. Check cache first (Section 15)
            cached = self.website_cache.get(url)
            if cached:
                self.metrics["cache_hits"] += 1
                self.metrics["business_websites_crawled"] += 1
                
                # Check cache age (reuse if within 7 days)
                age_days = (time.time() - cached.last_scraped_at) / 86400
                if age_days < 7:
                    # Reuse cached result
                    self._process_extracted_data(
                        target=target,
                        emails=cached.emails,
                        phones=cached.phones,
                        biz_name=cached.business_name or target.get("business_name"),
                        address=target.get("address"),
                        industry=industry,
                        extraction_method="cache",
                        confidence_score=cached.confidence_score or 0.0,
                        evidence=[],
                        services=None,
                    )
                    continue

            # Cache is stale or miss -> crawl
            self.metrics["cache_misses"] += 1
            self.metrics["business_websites_crawled"] += 1

            pages_content = self._fetch_static_pages(url)
            rendered = False
            if not pages_content:
                pages_content = browser_pool.crawl_domain(
                    url,
                    user_id=self.workspace_id,
                    job_id=self.job_id,
                )
                rendered = True
                if not pages_content:
                    continue

            # Extract contacts using cheap extractor (Section 17)
            result = self.contact_extractor.extract_from_pages(pages_content, url)
            if self.fallback_extractor.should_fallback(result) and not rendered:
                rendered_pages = browser_pool.crawl_domain(
                    url,
                    user_id=self.workspace_id,
                    job_id=self.job_id,
                )
                if rendered_pages:
                    pages_content = {**pages_content, **rendered_pages}
                    rendered = True
                    result = self.contact_extractor.extract_from_pages(pages_content, url)
            
            emails = result.get("emails", [])
            phones = result.get("phones", [])
            biz_name = result.get("business_name") or target.get("business_name")
            extraction_method = "cheap_extractor"
            confidence_score = float(result.get("confidence_score") or 0.0)
            evidence: List[str] = []
            services = None
            source_snapshots = snapshot_store.store_pages(
                job_id=self.job_id,
                base_url=url,
                pages=pages_content,
                rendered=rendered,
            )

            # Cache the new result
            cache_entry = CacheEntry(
                domain=domain,
                url=url,
                last_scraped_at=time.time(),
                html_hash=self.website_cache.compute_html_hash(pages_content.get("homepage", "")),
                emails=emails,
                phones=phones,
                business_name=biz_name,
                schema_data=result.get("schema_data", {}),
                crawl_status="success" if emails else "partial",
                confidence_score=result.get("confidence_score", 0.0),
                pages_scraped=list(pages_content.keys()),
            )
            self.website_cache.put(cache_entry)

            # 2. Fallback to ScrapeGraphAI if deterministic extraction is weak.
            if (
                self.fallback_extractor.should_fallback(result)
                and self.metrics["llm_fallback_calls"] < self.max_llm_fallback_calls
            ):
                self.metrics["llm_fallback_calls"] += 1
                sg_result = self._run_scrapegraph_fallback(
                    pages_content=pages_content,
                    url=url,
                    industry=industry,
                    target_location=self.location_raw,
                    country=self.city_data.get("country"),
                )
                if sg_result.get("status") == "ok":
                    if sg_result.get("email"):
                        emails = [sg_result["email"]]
                    if sg_result.get("businessName"):
                        biz_name = sg_result["businessName"]
                    if sg_result.get("phone"):
                        phones = [sg_result["phone"]]
                    if sg_result.get("suburb"):
                        target["suburb"] = sg_result["suburb"]
                    services = sg_result.get("services") or None
                    evidence = sg_result.get("evidence") or []
                    confidence_score = max(confidence_score, float(sg_result.get("confidence") or 0.0))
                    extraction_method = "scrapegraphai"
                else:
                    self.emit_event(
                        job_id=self.job_id,
                        step="llm_fallback",
                        status="info",
                        message=f"ScrapeGraphAI fallback skipped for {url}: {sg_result.get('reason', 'no_result')}",
                        website_url=url,
                        extraction_method="scrapegraphai",
                    )
            elif self.fallback_extractor.should_fallback(result):
                self.emit_event(
                    job_id=self.job_id,
                    step="llm_fallback",
                    status="info",
                    message=f"ScrapeGraphAI fallback cap reached for job ({self.max_llm_fallback_calls}).",
                    website_url=url,
                    extraction_method="scrapegraphai",
                )

            self._process_extracted_data(
                target=target,
                emails=emails,
                phones=phones,
                biz_name=biz_name,
                address=target.get("address") or result.get("address"),
                industry=industry,
                extraction_method=extraction_method,
                confidence_score=confidence_score,
                evidence=evidence,
                services=services,
                source_snapshots=source_snapshots,
            )

    def _process_directories_batch(self, industry: str, batch_size: int = 1):
        """Process directory pages from DirectoryQueue."""
        batch = self.directory_queue[:batch_size]
        self.directory_queue = self.directory_queue[batch_size:]

        for target in batch:
            if self.check_cancelled():
                return

            url = target["url"]
            self.emit_event(
                job_id=self.job_id, step="directory_crawler", status="running",
                message=f"Processing directory: {url}",
                website_url=url
            )
            self.metrics["directories_processed"] += 1

            listings = self.directory_crawler.crawl(url)
            self.metrics["directory_listings_found"] += len(listings)

            # Deduplicate domain urls from listings before adding to BusinessQueue (Section 14.1)
            discovered_domains = set()

            for listing in listings:
                site_url = listing.get("website_url")
                biz_name = listing.get("business_name")
                phone = listing.get("phone")
                address = listing.get("address")
                suburb = listing.get("suburb") or target.get("suburb")

                if site_url:
                    normalized_url = SearchResultNormalizer.normalize(site_url)
                    site_domain = self._extract_domain(normalized_url)
                    
                    if site_domain and site_domain not in self.seen_domains and site_domain not in discovered_domains:
                        discovered_domains.add(site_domain)
                        self.metrics["directory_official_websites_found"] += 1
                        
                        # Queue back to BusinessQueue (Section 14)
                        self.business_queue.append({
                            "url": normalized_url,
                            "business_name": biz_name,
                            "phone": phone,
                            "suburb": suburb,
                            "address": address,
                            "source_type": "directory_discovered_website",
                            "source_url": url
                        })
                        self.metrics["business_queue_count"] += 1
                else:
                    # Save Tier C only if no website (Section 14 & 27)
                    # Requires business_name + suburb/phone/address (Section 14)
                    if biz_name and (suburb or phone or address):
                        self._process_extracted_data(
                            target={
                                "url": url,
                                "business_name": biz_name,
                                "phone": phone,
                                "suburb": suburb,
                                "address": address,
                                "source_type": "directory_only",
                                "source_url": url
                            },
                            emails=[],
                            phones=[phone] if phone else [],
                            biz_name=biz_name,
                            address=address,
                            industry=industry,
                            extraction_method="directory_cheap",
                            confidence_score=0.6,
                            evidence=[],
                            services=None,
                        )

    def _execute_search_query_batch(self, batch_size: int = 5):
        """Execute search queries from search_query_pool."""
        batch = self.search_query_pool[:batch_size]
        self.search_query_pool = self.search_query_pool[batch_size:]

        self.emit_event(
            job_id=self.job_id, step="searching", status="running",
            message=f"Executing {len(batch)} DuckDuckGo queries..."
        )

        for query in batch:
            if self.check_cancelled():
                return

            urls = self.ddg_searcher.search(query, emit_event=self._emit_internal_event)
            self.metrics["queries_executed"] += 1
            self.metrics["search_results_found"] += len(urls)

            for raw_url in urls:
                # Clean URL
                url = SearchResultNormalizer.normalize(raw_url)
                if not url:
                    continue

                self.metrics["unique_urls_found"] += 1
                domain = self._extract_domain(url)
                if domain:
                    self.metrics["unique_domains_found"] += 1

                # Classify URL (Section 13)
                classification = self.url_classifier.classify(url)
                
                if classification == "business_website":
                    # Check duplicate by domain (Section 15)
                    domain = self._extract_domain(url)
                    if domain and domain not in self.seen_domains:
                        self.seen_domains.add(domain)
                        self.business_queue.append({
                            "url": url,
                            "source_type": "direct_website",
                            "source_url": url
                        })
                        self.metrics["business_queue_count"] += 1
                        
                elif classification == "directory":
                    self.directory_queue.append({
                        "url": url,
                        "suburb": self.location_raw
                    })
                    self.metrics["directory_queue_count"] += 1
                    
                elif classification == "unknown":
                    self.unknown_queue.append({"url": url})
                    
                # bad classification gets skipped completely (IgnoreQueue)

    def _run_scrapegraph_fallback(
        self,
        pages_content: Dict[str, str],
        url: str,
        industry: str,
        target_location: str,
        country: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run evidence-gated ScrapeGraphAI fallback extraction."""
        self.emit_event(
            job_id=self.job_id, step="llm_fallback", status="running",
            message=f"Calling ScrapeGraphAI fallback for website: {url}",
            website_url=url
        )
        return self.fallback_extractor.extract(
            pages=pages_content,
            url=url,
            industry=industry,
            target_location=target_location,
            country=country,
        )

    # ─── Data & Deduplication logic (Section 20 & 22) ───────────────────

    def _process_extracted_data(
        self,
        target: Dict[str, Any],
        emails: List[str],
        phones: List[str],
        biz_name: Optional[str],
        address: Optional[str],
        industry: str,
        extraction_method: str,
        confidence_score: float = 0.0,
        evidence: Optional[List[str]] = None,
        services: Optional[List[str]] = None,
        source_snapshots: Optional[List[Dict[str, Any]]] = None,
    ):
        """Validate, deduplicate, score, and tier leads before saving."""
        email = emails[0] if emails else None
        phone = phones[0] if phones else target.get("phone")
        suburb = target.get("suburb") or self.location_raw

        # Run through quality gate (Section 19, 21, 22, 22.1)
        quality = self.quality_gate.evaluate(
            email=email,
            business_name=biz_name,
            website=target.get("url"),
            phone=phone,
            suburb=suburb,
            industry=industry,
            target_location=self.location_raw,
            services=", ".join(services) if services else None,
            confidence_score=confidence_score,
            source_type=target.get("source_type", "direct_website"),
            extraction_method=extraction_method,
            address=address
        )

        # Check duplicate before saving (Section 20)
        is_duplicate = self._check_and_merge_duplicate(
            email=email,
            website=target.get("url"),
            phone=phone,
            name=biz_name,
            suburb=suburb,
            address=address,
            source_url=target.get("source_url"),
            source_type=target.get("source_type")
        )

        if is_duplicate:
            self.metrics["duplicates_merged"] += 1
            self.emit_event(
                job_id=self.job_id, step="duplicate_skipped", status="info",
                message=f"Duplicate skipped & source merged: {biz_name or email}",
                email=email,
                business_name=biz_name
            )
            return

        if not quality["passed"]:
            self.emit_event(
                job_id=self.job_id, step="quality_gate_blocked", status="info",
                message=f"Lead candidate blocked by quality gate: {biz_name or email}",
                email=email,
                blocks=quality["blocks"]
            )
            return

        # Increment Tier Counts
        tier = quality["tier"]
        if tier == "A":
            self.metrics["tier_a_count"] += 1
            self.metrics["valid_emails_saved"] += 1
        elif tier == "B":
            self.metrics["tier_b_count"] += 1
            self.metrics["valid_emails_saved"] += 1
        elif tier == "C":
            self.metrics["tier_c_count"] += 1

        self.metrics["email_deficit"] = max(0, self.metrics["target_quantity"] - self.metrics["valid_emails_saved"])

        # Save to CRM via callback
        self.save_lead(
            email=email,
            business_name=biz_name,
            website=target.get("url"),
            phone=phone,
            suburb=suburb,
            address=address,
            quality_score=quality["quality_score"],
            quality_flags=quality["flags"] + [f"tier_{tier}"],
            source_url=target.get("source_url") or target.get("url"),
            page_type=target.get("source_type", "direct_website"),
            extraction_method=extraction_method,
            confidence_score=confidence_score,
            evidence=evidence or [],
            services=services or [],
            source_snapshots=source_snapshots or [],
            location_status=quality.get("location_status"),
            location_confidence=quality.get("location_confidence"),
            location_evidence=quality.get("location_evidence", []),
            detected_location=quality.get("detected_location"),
        )

        # Add to tracking index for future dedups
        lead_ref = {
            "email": email,
            "website": target.get("url"),
            "phone": phone,
            "name": biz_name,
            "suburb": suburb,
            "address": address
        }
        if email:
            self.discovered_leads[email.lower()] = lead_ref
        domain = self._extract_domain(target.get("url"))
        if domain:
            self.discovered_domains[domain] = email or "tier_c"
        if phone:
            self.discovered_phones[phone] = email or "tier_c"
        if biz_name and suburb:
            normalized_name = normalize_business_name(biz_name)
            if normalized_name:
                self.discovered_names_suburbs[(normalized_name, suburb.lower().strip())] = email or "tier_c"
        if biz_name and address:
            normalized_name = normalize_business_name(biz_name)
            if normalized_name:
                self.discovered_names_addresses[(normalized_name, address.lower().strip())] = email or "tier_c"

        self.emit_event(
            job_id=self.job_id, step="lead_found", status="success",
            message=f"Saved qualified lead: {biz_name or email} — Tier {tier} (Score: {quality['quality_score']})",
            business_name=biz_name,
            email=email,
            phone=phone,
            website_url=target.get("url"),
            suburb=suburb,
            tier=tier,
            quality_score=quality["quality_score"],
            extraction_method=extraction_method,
            confidence_score=confidence_score,
        )

    def _check_and_merge_duplicate(
        self,
        email: Optional[str],
        website: Optional[str],
        phone: Optional[str],
        name: Optional[str],
        suburb: Optional[str],
        address: Optional[str],
        source_url: Optional[str],
        source_type: Optional[str]
    ) -> bool:
        """Evaluate if the lead matches an existing record and trigger source merge (Section 20)."""
        # 1. Primary dedupe: email
        if email and email.lower().strip() in self.discovered_leads:
            return True

        # 2. Secondary dedupe: domain
        domain = self._extract_domain(website)
        if domain and domain in self.discovered_domains:
            return True

        # 3. Secondary dedupe: phone
        if phone and phone in self.discovered_phones:
            return True

        # 4. Secondary dedupe: name + location with fuzzy matching (85% threshold)
        if name:
            normalized_name = normalize_business_name(name)
            if not normalized_name:
                return False
            name_norm = re.sub(r'[^a-z0-9]', '', normalized_name)
            
            # Check name + suburb
            if suburb:
                sub_norm = suburb.lower().strip()
                for (ex_name, ex_sub), _ in self.discovered_names_suburbs.items():
                    if ex_sub == sub_norm:
                        ex_name_norm = re.sub(r'[^a-z0-9]', '', ex_name)
                        if SequenceMatcher(None, name_norm, ex_name_norm).ratio() >= 0.85:
                            return True
            
            # Check name + address
            if address:
                addr_norm = address.lower().strip()
                for (ex_name, ex_addr), _ in self.discovered_names_addresses.items():
                    if ex_addr == addr_norm:
                        ex_name_norm = re.sub(r'[^a-z0-9]', '', ex_name)
                        if SequenceMatcher(None, name_norm, ex_name_norm).ratio() >= 0.85:
                            return True

        return False

    # ─── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _extract_domain(url: Optional[str]) -> Optional[str]:
        if not url:
            return None
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower().lstrip("www.")
            return domain if domain else None
        except Exception:
            return None

    def _emit_internal_event(self, **kwargs):
        """Interface helper for sub-services to raise webhook events."""
        self.emit_event(job_id=self.job_id, **kwargs)

    def _fetch_static_pages(self, base_url: str) -> Dict[str, str]:
        """Fetch homepage and priority internal pages without browser rendering."""
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; AzuraLeadDiscovery/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        }
        pages: Dict[str, str] = {}
        try:
            response = requests.get(base_url, headers=headers, timeout=min(config.SCRAPE_TIMEOUT_SECONDS, 15))
            content_type = response.headers.get("content-type", "")
            if response.status_code >= 400 or "html" not in content_type.lower():
                return {}
            pages["homepage"] = response.text
            links = re.findall(r'href=["\']([^"\']+)["\']', response.text, flags=re.IGNORECASE)
            priority = self._priority_static_links(base_url, links)
            for page_type, link in priority[: max(0, config.MAX_PAGES_PER_SITE - 1)]:
                try:
                    page_response = requests.get(link, headers=headers, timeout=min(config.SCRAPE_TIMEOUT_SECONDS, 15))
                    page_content_type = page_response.headers.get("content-type", "")
                    if page_response.status_code < 400 and "html" in page_content_type.lower():
                        pages[page_type] = page_response.text
                except requests.RequestException:
                    continue
        except requests.RequestException:
            return {}
        return pages

    def _priority_static_links(self, base_url: str, links: List[str]) -> List[tuple[str, str]]:
        base_domain = self._extract_domain(base_url)
        seen = {base_url.rstrip("/")}
        priority: List[tuple[str, str]] = []
        for raw_link in links:
            if not raw_link or raw_link.startswith(("mailto:", "tel:", "#", "javascript:")):
                continue
            link = urljoin(base_url, raw_link).split("#")[0].rstrip("/")
            if link in seen:
                continue
            domain = self._extract_domain(link)
            if domain and base_domain and domain != base_domain:
                continue
            page_type = self._page_type_from_url(link)
            if page_type in {"contact", "about", "services", "location"}:
                seen.add(link)
                priority.append((page_type, link))
        return priority

    @staticmethod
    def _page_type_from_url(url: str) -> str:
        path = urlparse(url).path.lower()
        if "contact" in path:
            return "contact"
        if "about" in path:
            return "about"
        if "service" in path:
            return "services"
        if "location" in path:
            return "location"
        return "internal"

    @staticmethod
    def _format_location(location: str, country: Optional[str] = None) -> str:
        loc = (location or "").strip()
        c = (country or "").strip()
        if not c or not loc or c.lower() in loc.lower():
            return loc
        return f"{loc}, {c}"

    def _build_final_report(self, success: bool = True, rec_suburbs: List[str] = None) -> str:
        """Generate final Markdown result report (Section 26)."""
        tot_leads = self.metrics["tier_a_count"] + self.metrics["tier_b_count"] + self.metrics["tier_c_count"]
        
        report = (
            f"\n=== Azura Lead Scraper — Results ===\n\n"
            f"Target:         {self.metrics['target_quantity']} qualified emails\n"
            f"Location:       {self.location_raw}\n"
            f"Completed at:   {time.strftime('%Y-%m-%d %H:%M Local')}\n\n"
            f"Tier A leads:   {self.metrics['tier_a_count']}\n"
            f"Tier B leads:   {self.metrics['tier_b_count']}\n"
            f"Tier C leads:   {self.metrics['tier_c_count']}\n"
            f"──────────────────────────────────\n"
            f"Total leads:    {tot_leads}\n"
            f"Emails saved:   {self.metrics['valid_emails_saved']}\n"
            f"Email deficit:  {self.metrics['email_deficit']}\n\n"
            f"Sources:\n"
            f"DuckDuckGo queries executed: {self.metrics['queries_executed']}\n"
            f"Business websites crawled: {self.metrics['business_websites_crawled']}\n"
            f"Directories processed: {self.metrics['directories_processed']}\n"
            f"Official websites found from directories: {self.metrics['directory_official_websites_found']}\n"
            f"Duplicates merged: {self.metrics['duplicates_merged']}\n"
            f"LLM fallback calls: {self.metrics['llm_fallback_calls']}\n"
        )

        if not success:
            report += (
                f"\nReason target not met:\n"
                f"{self.location_raw} has limited businesses with publicly listed email addresses.\n"
                f"More businesses were found, but no public email was available.\n"
            )
            if rec_suburbs:
                report += (
                    f"\nRecommendation:\n"
                    f"Expand to {', '.join(rec_suburbs)}.\n\n"
                    f"Expand nearby suburbs? [YES / NO]\n"
                )
        else:
            report += f"\nStatus:\nTarget reached successfully.\n"

        return report
