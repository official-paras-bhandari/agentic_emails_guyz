import json
import os
import time
import uuid
import re
import requests
import hmac
import hashlib
from urllib.parse import quote_plus
from typing import Dict, Any, List, Optional
from src.config import config
from src.services.memory_service import memory_service

# Monkey patch scrapegraphai to bypass broken Google Search scraping and use ddgs
import scrapegraphai.utils.research_web
import scrapegraphai.nodes.search_internet_node

def _custom_search_on_web(query: str, search_engine: str = "Google", max_results: int = 10) -> List[str]:
    print(f"[ScrapeGraphAgent] Custom search_on_web called for query: {query}")
    from ddgs import DDGS
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            return [r.get("href") for r in results if r.get("href")]
    except Exception as e:
        print(f"[ScrapeGraphAgent] DDGS search error: {e}")
        return []

scrapegraphai.utils.research_web.search_on_web = _custom_search_on_web
scrapegraphai.nodes.search_internet_node.search_on_web = _custom_search_on_web

def clean_email(email: Any) -> Optional[str]:
    if not email or not isinstance(email, str):
        return None
    email_clean = email.strip().lower()
    # Reject common placeholder values
    if email_clean in {"na", "n/a", "none", "null", "no email", "not available", "no@email.com", "placeholder@email.com", "undefined"}:
        return None
    # Quick regex validation for a valid email structure (must contain @ and a domain dot)
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_clean):
        return None
    return email.strip()

IGNORED_DOMAINS = [
    "yelp.", "yellowpages.", "truelocal.", "whitepages.", "facebook.com", "instagram.com",
    "fresha.com", "localsearch.", "yp.com", "yell.com", "localbusinessguide.", "directory",
    "reddit.com", "tiktok.com", "seek.com.au", "indeed.com", "jora.com", "linkedin.com",
    "pinterest.com", "youtube.com", "maps.apple.com", "google.com", "tripadvisor.com", "tripadvisor.co"
]

# Human-readable labels for each source
SOURCE_LABELS = {
    "web":          "Web Search",
    "duckduckgo":   "DuckDuckGo Search",
    "yellowpages":  "Yellow Pages AU",
    "yellowpages_us": "Yellow Pages US",
    "yellowpages_uk": "Yellow Pages UK",
    "whitepages":   "White Pages AU",
    "whitepages_us": "White Pages US",
    "truelocal":    "True Local AU",
    "yelp":         "Yelp",
    "google_maps":  "Google Maps",
}

# Country-aware directory fallbacks — ordered by reliability
# Detects country keywords in the search query location
DIRECTORY_FALLBACKS = {
    # Australian keywords → AU directories
    "au": [
        ("yellowpages",  "https://www.yellowpages.com.au/search/listings?q={q}&l={l}"),
        ("truelocal",    "https://www.truelocal.com.au/find/{kslug}/{lslug}"),
        ("whitepages",   "https://www.whitepages.com.au/search/business?name={q}&where={l}"),
        ("yelp",         "https://www.yelp.com.au/search?find_desc={q}&find_loc={l}"),
    ],
    # US keywords → US directories
    "us": [
        ("yellowpages_us", "https://www.yellowpages.com/search?search_terms={q}&geo_location_terms={l}"),
        ("whitepages_us",  "https://www.whitepages.com/business/{q}/{l}"),
        ("yelp",           "https://www.yelp.com/search?find_desc={q}&find_loc={l}"),
    ],
    # UK keywords → UK directories
    "uk": [
        ("yellowpages_uk", "https://www.yell.com/ucs/UcsSearchAction.do?keywords={q}&location={l}"),
        ("yelp",           "https://www.yelp.co.uk/search?find_desc={q}&find_loc={l}"),
    ],
    # Default / global fallback
    "global": [
        ("yelp",         "https://www.yelp.com/search?find_desc={q}&find_loc={l}"),
        ("yellowpages",  "https://www.yellowpages.com.au/search/listings?q={q}&l={l}"),
    ],
}

# Maximum number of search batches to run before giving up if duplicates keep blocking
MAX_SCRAPE_ATTEMPTS = 3

class ScrapeGraphAgent:
    def __init__(self, mock_mode: Optional[bool] = None):
        llm_cfg = config.get_llm_config()
        self.api_key = llm_cfg["llm"].get("api_key")
        self.model = llm_cfg["llm"].get("model")
        self.mock_mode = config.MOCK_MODE if mock_mode is None else mock_mode
        self.webhook_url = config.WEBHOOK_URL
        self.webhook_secret = config.WEBHOOK_SECRET

    def emit_event(self, job_id: str, step: str, status: str, message: str, **kwargs):
        timestamp = time.time()
        event_data = {
            "job_id": job_id,
            "step": step,
            "status": status,
            "message": message,
            "timestamp": timestamp,
            "mock_mode": self.mock_mode,
            **kwargs
        }
        
        payload = {"type": "agent_event", "data": event_data}
        raw_body, headers = self._get_webhook_request(payload)
        
        print(f"EVENT [{step}]: {message}")
        
        response = requests.post(self.webhook_url, data=raw_body, headers=headers, timeout=10)
        response.raise_for_status()

    def _get_webhook_request(self, payload: Dict[str, Any]):
        headers = {"Content-Type": "application/json"}
        raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
        timestamp = str(int(time.time()))
        signature = hmac.new(self.webhook_secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
        headers["X-Webhook-Signature"] = signature
        headers["X-Webhook-Timestamp"] = timestamp
        return raw_body, headers

    def _get_unique_leads_count(self, job_id: str, workspace_id: str) -> int:
        """Poll the backend to count how many unique (non-duplicate) leads have been saved for this job."""
        base_url = self.webhook_url.split('/api/webhooks/worker')[0]
        try:
            response = requests.get(
                f"{base_url}/api/jobs/{job_id}",
                params={"workspaceId": workspace_id},
                headers={"X-Internal-Api-Key": config.INTERNAL_API_KEY} if config.INTERNAL_API_KEY else {},
                timeout=10
            )
            if response.ok:
                data = response.json()
                leads = data.get("leads", [])
                # Only count leads that are NOT duplicates
                unique = [l for l in leads if l.get("status") != "duplicate"]
                return len(unique)
        except requests.RequestException as e:
            print(f"[ScrapeGraphAgent] Could not fetch lead count: {e}")
        return 0

    def run_integrated_scrape(self, job_id: str, objective: str, search_query: str, quantity: int = 5, workspace_id: str = ""):
        if self.mock_mode:
            self.emit_event(job_id=job_id, step="searching", status="running",
                            message=f"Searching for: {search_query}", query=search_query)
            self._run_mock_scrape(job_id, quantity, workspace_id)
            return

        # ── STEP 1: Search the web directly for business websites ──────────────
        # This is always the primary strategy — visit real business websites to
        # find their email addresses. Directories are only used as fallback.
        self.emit_event(
            job_id=job_id, step="searching", status="running",
            message=f"Searching web for business websites: {search_query}",
            query=search_query, scrape_source="web",
        )
        unique_found = self._run_real_scrape(job_id, search_query, quantity, workspace_id)

        # ── STEP 2: Fallback to directories if not enough emails found ─────────
        if unique_found < quantity:
            from src.workflows.command_workflow import is_job_cancelled
            if is_job_cancelled(job_id, workspace_id):
                self.emit_event(job_id=job_id, step="cancelled", status="cancelled",
                                message="Scraping cancelled by user.")
                return

            remaining = quantity - unique_found
            directories = self._get_fallback_directories(search_query)
            for (source_name, dir_url) in directories:
                if unique_found >= quantity:
                    break
                if is_job_cancelled(job_id, workspace_id):
                    self.emit_event(job_id=job_id, step="cancelled", status="cancelled",
                                    message="Scraping cancelled by user.")
                    return

                self.emit_event(
                    job_id=job_id, step="searching", status="running",
                    message=f"Not enough leads yet ({unique_found}/{quantity}) — trying {SOURCE_LABELS.get(source_name, source_name)}…",
                    scrape_source=source_name, website_url=dir_url,
                )
                found = self._run_directory_scrape(
                    job_id, search_query, remaining, workspace_id,
                    directory_url=dir_url, source_name=source_name,
                )
                unique_found += found
                remaining = quantity - unique_found

        from src.workflows.command_workflow import is_job_cancelled
        if is_job_cancelled(job_id, workspace_id):
            self.emit_event(job_id=job_id, step="cancelled", status="cancelled",
                            message="Scraping cancelled by user.")
            return

        self.emit_event(
            job_id=job_id, step="completed", status="success",
            message=f"Done. {unique_found} unique lead(s) found.",
        )

    def _location_matches(self, target_location: str, listing_suburb: str, listing_address: str) -> bool:
        """Verify if the listing's suburb or address matches the target location keywords."""
        if not target_location:
            return True
        target_lower = target_location.lower()
        suburb_lower = (listing_suburb or "").lower()
        address_lower = (listing_address or "").lower()
        
        # If suburb and address are both missing, keep it as fallback
        if not suburb_lower and not address_lower:
            return True
            
        # Split target location into key words, ignoring common filler/country/state words
        ignore_words = {
            "in", "at", "near", "around", "from", "australia", "usa", "uk", "state", "states", "united",
            "nsw", "vic", "qld", "wa", "sa", "tas", "act", "nt", "new south wales", "victoria", "queensland",
            "western australia", "south australia", "tasmania", "australian capital territory", "northern territory",
            "united kingdom", "america", "us"
        }
        target_words = [w for w in re.split(r'\W+', target_lower) if w and w not in ignore_words]
        
        if not target_words:
            return True
            
        # Check if any key target location word is contained in the suburb or address
        for word in target_words:
            if word in suburb_lower or word in address_lower:
                return True
                
        return False

    def _get_fallback_directories(self, search_query: str) -> List[tuple]:
        """
        Return ordered list of (source_name, url) directory fallbacks
        based on the country detected in the search query.
        """
        keyword, location = self._parse_query(search_query)
        loc_lower = location.lower()
        q = quote_plus(keyword)
        l = quote_plus(location)
        kslug = keyword.lower().replace(" ", "-")
        lslug = location.lower().replace(", ", "-").replace(",", "-").replace(" ", "-")

        # Detect country from location string
        au_hints = ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide",
                    "canberra", "hobart", "darwin", "nsw", "vic", "qld", "wa", "sa",
                    "act", "nt", "tas", "campsie", "parramatta", "bondi", "newtown"]
        us_hints = ["usa", "united states", "new york", "los angeles", "chicago",
                    "houston", "miami", "seattle", "boston", "san francisco", "dallas"]
        uk_hints = ["uk", "england", "london", "manchester", "birmingham", "leeds",
                    "glasgow", "edinburgh", "bristol", "liverpool"]

        if any(h in loc_lower for h in au_hints):
            country = "au"
        elif any(h in loc_lower for h in us_hints):
            country = "us"
        elif any(h in loc_lower for h in uk_hints):
            country = "uk"
        else:
            home_country = config.HOME_COUNTRY.lower() if hasattr(config, "HOME_COUNTRY") else "global"
            country = home_country if home_country in DIRECTORY_FALLBACKS else "global"


        results = []
        for (name, template) in DIRECTORY_FALLBACKS[country]:
            url = (template
                   .replace("{q}", q)
                   .replace("{l}", l)
                   .replace("{kslug}", kslug)
                   .replace("{lslug}", lslug))
            results.append((name, url))
        return results

    def _run_mock_scrape(self, job_id: str, quantity: int, workspace_id: str):
        from src.workflows.command_workflow import is_job_cancelled
        
        # Extended mock targets — more than we'll ever need so deduplication
        # doesn't prevent reaching the requested quantity
        ALL_MOCK_TARGETS = [
            {"url": "https://sydneyhairco.com.au",    "name": "Sydney Hair Co",      "suburb": "Surry Hills",    "phone": "02 9000 1111"},
            {"url": "https://theparlour.com.au",       "name": "The Hair Parlour",    "suburb": "Paddington",     "phone": "02 9000 2222"},
            {"url": "https://innerwestsalon.com.au",   "name": "Inner West Salon",    "suburb": "Newtown",        "phone": "02 9000 3333"},
            {"url": "https://bondibeautystudio.com.au","name": "Bondi Beauty Studio", "suburb": "Bondi",          "phone": "02 9000 4444"},
            {"url": "https://chatswoodnailspa.com.au", "name": "Chatswood Nail Spa",  "suburb": "Chatswood",      "phone": "02 9000 5555"},
            {"url": "https://moodyhairsydney.com.au",  "name": "Moody Hair Sydney",   "suburb": "Glebe",          "phone": "02 9000 6666"},
            {"url": "https://edgecliffbeauty.com.au",  "name": "Edgecliff Beauty",    "suburb": "Edgecliff",      "phone": "02 9000 7777"},
            {"url": "https://rosebaysalon.com.au",     "name": "Rosebay Salon",       "suburb": "Rose Bay",       "phone": "02 9000 8888"},
            {"url": "https://balmaincuts.com.au",      "name": "Balmain Cuts",        "suburb": "Balmain",        "phone": "02 9000 9999"},
            {"url": "https://campsiehairstyle.com.au", "name": "Campsie Hair Style",  "suburb": "Campsie",        "phone": "02 9001 1111"},
        ]

        batch = ALL_MOCK_TARGETS[:quantity]

        self.emit_event(
            job_id=job_id,
            step="searching",
            status="success",
            message=f"[MOCK] Found {len(batch)} candidate websites.",
            candidate_urls=[t["url"] for t in batch]
        )

        for target in batch:
            if is_job_cancelled(job_id, workspace_id):
                self.emit_event(job_id=job_id, step="cancelled", status="cancelled",
                                message="Scraping cancelled by user.")
                return

            self.emit_event(
                job_id=job_id,
                step="visiting_url",
                status="running",
                message=f"[MOCK] Visiting {target['name']}",
                website_url=target["url"]
            )
            time.sleep(0.5)

            contact_url = f"{target['url']}/contact"
            self.emit_event(
                job_id=job_id,
                step="opening_page",
                status="running",
                message="[MOCK] Opening contact page",
                website_url=target["url"],
                current_url=contact_url,
                page_type="contact_page"
            )
            time.sleep(0.5)

            email = f"hello@{target['url'].split('//')[1]}"
            self.emit_event(
                job_id=job_id,
                step="lead_found",
                status="success",
                message=f"[MOCK] Lead found: {email}",
                business_name=target["name"],
                email=email,
                phone=target["phone"],
                website_url=target["url"],
                source_url=contact_url,
                page_type="contact_page",
                extraction_location="footer",
                suburb=target["suburb"],
                scraped_at=time.time(),
                extracted_fields=["email", "business_name", "suburb", "phone"]
            )
            # Small pause so the webhook can process the lead before next
            time.sleep(0.3)

        # After the batch, check how many unique leads are actually saved
        time.sleep(1.5)  # give backend a moment to process all webhook events
        self.emit_event(job_id=job_id, step="completed", status="success",
                        message="Mock scraping complete.")

    # ─── Directory helpers ────────────────────────────────────────────────────

    def _parse_query(self, search_query: str):
        """
        Split e.g. 'salon owners in Campsie Sydney'
        → keyword='salon owners', location='Campsie Sydney'.
        Handles 'in', 'at', 'near', 'around', 'from' as delimiters.
        """
        q = search_query.lower()
        for sep in (" in ", " at ", " near ", " around ", " from "):
            if sep in q:
                idx = q.index(sep)
                return search_query[:idx].strip(), search_query[idx + len(sep):].strip()
        return search_query.strip(), ""

    def _build_directory_url(self, search_query: str) -> str:
        """Build the directory listing URL from the search query."""
        keyword, location = self._parse_query(search_query)

        if config.SCRAPE_SOURCE == "yellowpages":
            q = quote_plus(keyword)
            url = f"https://www.yellowpages.com.au/search/listings?q={q}"
            if location:
                url += f"&l={quote_plus(location)}"
            return url

        if config.SCRAPE_SOURCE == "truelocal":
            k = keyword.lower().replace(" ", "-")
            l = location.lower().replace(", ", "-").replace(",", "-").replace(" ", "-")
            return f"https://www.truelocal.com.au/find/{k}/{l}" if l else f"https://www.truelocal.com.au/find/{k}"

        if config.SCRAPE_SOURCE == "google_maps":
            full = f"{keyword} {location}".strip()
            return f"https://www.google.com/maps/search/{quote_plus(full)}"

        return ""

    def _run_directory_scrape(self, job_id: str, search_query: str, quantity: int,
                               workspace_id: str, directory_url: str = "",
                               source_name: str = "") -> int:
        """
        Two-step directory scraping:
        1. Scrape directory listing page to get business names + website URLs.
        2. Visit each business website to extract email address.
        Returns number of leads found.
        """
        found_count = 0
        try:
            from scrapegraphai.graphs import SmartScraperGraph
            from src.workflows.command_workflow import is_job_cancelled
            from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeout

            graph_config = {
                **config.get_llm_config(),
                **config.get_embeddings_config(),
                "verbose": True,
                "headless": config.SCRAPE_HEADLESS,
            }

            source_label = SOURCE_LABELS.get(source_name, source_name or "Directory")

            if not directory_url:
                self.emit_event(job_id=job_id, step="error", status="failed",
                                message="No directory URL provided.")
                return 0

            # ── Step 1: extract listings from directory page ───────────────────
            self.emit_event(
                job_id=job_id, step="searching", status="running",
                message=f"Opening {source_label} listings page…",
                website_url=directory_url, query=search_query,
                scrape_source=source_name,
            )

            raw = SmartScraperGraph(
                prompt=(
                    f"Extract all business listings shown on this page. "
                    f"For each business return: business_name, phone, website_url, address, suburb. "
                    f"Return all listings on the page (up to 15 results) as a JSON list."
                ),
                source=directory_url,
                config=graph_config,
            ).run()

            listings: List[Dict] = []
            if isinstance(raw, list):
                listings = raw
            elif isinstance(raw, dict):
                listings = (
                    raw.get("listings") or raw.get("businesses") or
                    raw.get("results")  or raw.get("items") or []
                )
            _, target_location = self._parse_query(search_query)
            valid_listings = []
            for l in listings:
                if not isinstance(l, dict):
                    continue
                suburb = l.get("suburb") or l.get("address") or ""
                address = l.get("address") or ""
                if self._location_matches(target_location, suburb, address):
                    valid_listings.append(l)
                else:
                    print(f"[ScrapeGraphAgent] Skipping {l.get('business_name')} in {suburb} (location filter: {target_location})")

            listings = valid_listings[:quantity]


            if not listings:
                self.emit_event(job_id=job_id, step="searching", status="info",
                                message=f"No listings found on {source_label}.")
                return 0

            self.emit_event(
                job_id=job_id, step="searching", status="success",
                message=f"Found {len(listings)} businesses on {source_label}.",
                candidate_urls=[l.get("website_url", "") for l in listings if l.get("website_url")],
            )

            # ── Step 2: visit each business website to find email ─────────────
            lead_lock = __import__("threading").Lock()

            def scrape_business(listing: Dict):
                nonlocal found_count
                if is_job_cancelled(job_id, workspace_id):
                    return

                biz_name = listing.get("business_name") or listing.get("name") or "Unknown"
                site_url = (listing.get("website_url") or listing.get("website") or "").strip()
                if site_url.lower() in {"na", "n/a", "none", "null", "no website", "not available", ""}:
                    site_url = ""
                phone    = listing.get("phone") or listing.get("telephone") or ""
                suburb   = listing.get("suburb") or listing.get("address") or ""

                if not site_url:
                    # Try fallback search for the website URL using ddgs
                    search_query_website = f"{biz_name} {suburb} website"
                    self.emit_event(
                        job_id=job_id, step="searching", status="info",
                        message=f"'{biz_name}' has no website URL on {source_label} — searching web...",
                        business_name=biz_name, suburb=suburb,
                    )
                    from ddgs import DDGS
                    try:
                        with DDGS() as ddgs:
                            results = list(ddgs.text(search_query_website, max_results=3))
                            found_urls = [r.get("href") for r in results if r.get("href")]
                            # Find the first url that seems to be the official website (not directories or social media)
                            for u in found_urls:
                                u_lower = u.lower()
                                if any(x in u_lower for x in IGNORED_DOMAINS):
                                    continue
                                site_url = u
                                break
                    except Exception as e:
                        print(f"[ScrapeGraphAgent] Failed to search website for {biz_name}: {e}")

                if not site_url:
                    self.emit_event(
                        job_id=job_id, step="no_email_found", status="info",
                        message=f"'{biz_name}' has no website — skipping",
                        business_name=biz_name, phone=phone, suburb=suburb,
                    )
                    return

                self.emit_event(
                    job_id=job_id, step="visiting_url", status="running",
                    message=f"Visiting {biz_name}",
                    website_url=site_url, business_name=biz_name,
                )

                try:
                    result = SmartScraperGraph(
                        prompt=(
                            "Find the public contact email of this business. "
                            "Return: email, business_name, phone, address."
                        ),
                        source=site_url,
                        config=graph_config,
                    ).run() or {}
                    if not isinstance(result, dict):
                        result = {}

                    email = result.get("email") or result.get("email_address") or ""
                    cleaned = clean_email(email)
                    if cleaned:
                        self.emit_event(
                            job_id=job_id, step="lead_found", status="success",
                            message=f"Lead found: {biz_name} — {cleaned}",
                            business_name=biz_name, email=cleaned,
                            phone=phone or result.get("phone", ""),
                            website_url=site_url, source_url=directory_url,
                            suburb=suburb, page_type="website",
                            extraction_location="contact_section",
                            extracted_fields=["business_name", "email", "phone", "suburb"],
                            scraped_at=time.time(),
                        )
                        with lead_lock:
                            found_count += 1
                    else:
                        self.emit_event(
                            job_id=job_id, step="no_email_found", status="info",
                            message=f"'{biz_name}' has no public email on their website",
                            business_name=biz_name, phone=phone,
                            website_url=site_url, suburb=suburb,
                        )
                except Exception as e:
                    self.emit_event(
                        job_id=job_id, step="url_failed", status="error",
                        message=f"Failed to scrape '{biz_name}': {str(e)[:120]}",
                        website_url=site_url, business_name=biz_name,
                    )

            executor = ThreadPoolExecutor(max_workers=config.SCRAPE_CONCURRENCY)
            futures  = [executor.submit(scrape_business, l) for l in listings]
            try:
                for future in as_completed(futures, timeout=config.SCRAPE_TIMEOUT_SECONDS):
                    future.result()
            except FuturesTimeout:
                for f in futures:
                    f.cancel()
                self.emit_event(job_id=job_id, step="scrape_timeout", status="error",
                                message=f"Scraping exceeded {config.SCRAPE_TIMEOUT_SECONDS}s timeout.")
            finally:
                executor.shutdown(wait=False, cancel_futures=True)

        except Exception as e:
            import traceback
            print(traceback.format_exc())
            self.emit_event(job_id=job_id, step="error", status="failed", message=str(e))

        return found_count


    def _run_real_scrape(self, job_id: str, search_query: str, quantity: int, workspace_id: str) -> int:
        """Search web via DuckDuckGo, visit business websites, extract emails. Returns lead count."""
        try:
            from scrapegraphai.graphs import SearchGraph, SmartScraperGraph

            from src.workflows.command_workflow import is_job_cancelled
            
            graph_config = {
                **config.get_llm_config(),
                **config.get_embeddings_config(),
                "verbose": True,
                "headless": config.SCRAPE_HEADLESS,
                "search_engine": config.SEARCH_ENGINE,
                "max_results": max(10, quantity * 3),
            }

            unique_found = 0
            attempted_urls: set = set()
            attempt = 0

            while unique_found < quantity and attempt < MAX_SCRAPE_ATTEMPTS:
                attempt += 1
                # Vary the query slightly on retries to get different results
                page_modifier = "" if attempt == 1 else f" (more results, page {attempt})"
                effective_query = search_query + page_modifier

                self.emit_event(
                    job_id=job_id,
                    step="searching",
                    status="running",
                    message=f"Searching for more candidates: {effective_query}" if attempt > 1 else f"Searching for candidates: {effective_query}",
                    query=effective_query,
                    search_engine=config.SEARCH_ENGINE,
                    attempt=attempt
                )

                need = quantity - unique_found
                from ddgs import DDGS
                urls = []
                try:
                    with DDGS() as ddgs:
                        results = list(ddgs.text(f"{effective_query} official website", max_results=max(10, quantity * 3)))
                        raw_urls = [r.get("href") for r in results if r.get("href")]
                        for u in raw_urls:
                            u_lower = u.lower()
                            if any(x in u_lower for x in IGNORED_DOMAINS):
                                continue
                            urls.append(u)
                except Exception as e:
                    print(f"[ScrapeGraphAgent] DDGS search error in _run_real_scrape: {e}")

                # Filter out already-attempted URLs
                new_urls = [u for u in urls if u not in attempted_urls]
                new_urls = new_urls[:min(need * 2, config.MAX_SITES_PER_JOB)]  # fetch extras to compensate for dupes

                if not new_urls:
                    self.emit_event(job_id=job_id, step="searching", status="info",
                                    message="No new candidate websites found.")
                    break

                self.emit_event(
                    job_id=job_id,
                    step="searching",
                    status="success",
                    message=f"Found {len(new_urls)} new candidate websites (attempt {attempt}).",
                    candidate_urls=new_urls
                )

                attempted_urls.update(new_urls)

                from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError

                def scrape_site(url):
                    if is_job_cancelled(job_id, workspace_id):
                        return

                    self.emit_event(
                        job_id=job_id,
                        step="visiting_url",
                        status="running",
                        message=f"Analyzing {url}",
                        website_url=url
                    )

                    try:
                        extraction_prompt = (
                            "Extract the following information from this website: "
                            "business_name, email, phone, website_url (root), suburb, address, services. "
                            "If you find multiple emails, pick the most relevant one (info@, hello@, etc.)."
                        )

                        scraper = SmartScraperGraph(
                            prompt=extraction_prompt,
                            source=url,
                            config=graph_config
                        )

                        result = scraper.run()

                        _, target_location = self._parse_query(search_query)
                        suburb = result.get("suburb") or result.get("address") or ""
                        address = result.get("address") or ""
                        if not self._location_matches(target_location, suburb, address):
                            self.emit_event(
                                job_id=job_id,
                                step="no_email_found",
                                status="info",
                                message=f"Skipped lead '{result.get('business_name') or url}' outside target location '{target_location}'",
                                website_url=url
                            )
                            return

                        if not result or not (result.get("business_name") or result.get("email")):
                            self.emit_event(
                                job_id=job_id,
                                step="no_email_found",
                                status="info",
                                message=f"No lead data extracted from {url}",
                                website_url=url
                            )
                            return

                        email = result.get("email")
                        cleaned = clean_email(email)
                        if not cleaned:
                            self.emit_event(
                                job_id=job_id,
                                step="no_email_found",
                                status="info",
                                message=f"Found business '{result.get('business_name')}' but no email at {url}",
                                business_name=result.get("business_name"),
                                website_url=url
                            )
                            return

                        self.emit_event(
                            job_id=job_id,
                            step="lead_found",
                            status="success",
                            message=f"Lead extracted: {result.get('business_name') or cleaned}",
                            business_name=result.get("business_name"),
                            email=cleaned,
                            phone=result.get("phone"),
                            website_url=url,
                            source_url=url,
                            suburb=result.get("suburb"),
                            address=result.get("address"),
                            services=result.get("services"),
                            page_type="homepage",
                            extraction_location="body",
                            extracted_fields=[k for k, v in result.items() if v],
                            scraped_at=time.time()
                        )

                    except Exception as e:
                        self.emit_event(
                            job_id=job_id,
                            step="url_failed",
                            status="error",
                            message=f"Failed to scrape {url}: {str(e)}",
                            website_url=url
                        )

                executor = ThreadPoolExecutor(max_workers=config.SCRAPE_CONCURRENCY)
                futures = [executor.submit(scrape_site, url) for url in new_urls]
                try:
                    for future in as_completed(futures, timeout=config.SCRAPE_TIMEOUT_SECONDS):
                        future.result()
                except TimeoutError:
                    for future in futures:
                        future.cancel()
                    self.emit_event(job_id=job_id, step="scrape_timeout", status="error",
                                    message=f"Batch {attempt} exceeded {config.SCRAPE_TIMEOUT_SECONDS} seconds")
                finally:
                    executor.shutdown(wait=False, cancel_futures=True)

                if is_job_cancelled(job_id, workspace_id):
                    self.emit_event(job_id=job_id, step="cancelled", status="cancelled",
                                    message="Scraping cancelled by user.")
                    return unique_found

                # Check how many unique leads are now saved
                time.sleep(1)
                unique_found = self._get_unique_leads_count(job_id, workspace_id)
                print(f"[ScrapeGraphAgent] After attempt {attempt}: {unique_found}/{quantity} unique leads saved.")

                if unique_found < quantity:
                    self.emit_event(
                        job_id=job_id,
                        step="searching",
                        status="running",
                        message=f"Found {unique_found}/{quantity} unique leads — searching for more to replace duplicates...",
                    )

            return unique_found

        except ImportError:
            self.emit_event(job_id=job_id, step="error", status="failed",
                            message="scrapegraphai not installed correctly.")
        except Exception as e:
            import traceback
            print(traceback.format_exc())
            self.emit_event(job_id=job_id, step="error", status="failed", message=str(e))

        return unique_found if "unique_found" in dir() else 0

