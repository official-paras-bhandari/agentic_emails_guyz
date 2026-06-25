"""
DirectoryCrawler — crawler for directory and listing pages.
Uses fast DOM selectors first, falling back to ScrapeGraphAI only when yield is below threshold.
"""

import re
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

class DirectoryCrawler:
    """Orchestrates directory crawling and listing extraction."""

    def __init__(self, browser_pool, emit_event):
        self.browser_pool = browser_pool
        self.emit_event = emit_event

    def crawl(self, url: str) -> list[dict]:
        """
        Crawl directory page and extract business listings.
        
        Returns:
            List of business listing dicts.
        """
        # Fetch page HTML via browser pool (handles dynamic Javascript pages)
        pages = self.browser_pool.crawl_domain(url)
        html = pages.get("homepage", "")
        if not html:
            return []

        # 1. Cheap extraction first
        listings = self._extract_cheap(html, url)
        
        # 2. Count visible listing cards
        soup = BeautifulSoup(html, "html.parser")
        card_elements = soup.find_all(class_=re.compile(r"listing|result|card|business|item", re.I))
        visible_cards_count = len(card_elements)

        # 3. Check threshold for ScrapeGraphAI fallback trigger (Section 14.1)
        valid_listings = [l for l in listings if self._is_valid_listing(l)]

        if visible_cards_count > 5 and len(valid_listings) < 3:
            self.emit_event(
                step="directory_crawler", status="info",
                message=f"Cheap extractor returned only {len(valid_listings)} listings (cards: {visible_cards_count}). Calling ScrapeGraphAI fallback."
            )
            fallback_listings = self._extract_scrapegraph(url)
            if fallback_listings:
                # Merge fallback results into listings
                for fl in fallback_listings:
                    if self._is_valid_listing(fl):
                        name = fl.get("business_name")
                        # Check duplicate by name
                        duplicate = False
                        for existing in listings:
                            if existing.get("business_name", "").lower() == name.lower():
                                duplicate = True
                                # Merge missing fields
                                for k, v in fl.items():
                                    if v and not existing.get(k):
                                        existing[k] = v
                                break
                        if not duplicate:
                            listings.append(fl)
                            
        # Final cleanup and normalization
        cleaned_listings = []
        for l in listings:
            if self._is_valid_listing(l):
                # Clean website URL
                web = (l.get("website_url") or "").strip()
                if web and not web.startswith(("http://", "https://")):
                    web = "https://" + web
                l["website_url"] = web
                cleaned_listings.append(l)

        return cleaned_listings

    def _is_valid_listing(self, item: dict) -> bool:
        """Section 14.1: Business name and one key contact field present."""
        return bool(item.get("business_name") and (
            item.get("website_url") or 
            item.get("phone") or 
            item.get("address") or 
            item.get("suburb") or 
            item.get("profile_url")
        ))

    def _extract_cheap(self, html: str, url: str) -> list[dict]:
        """Extract business listings using cheap DOM parser rules."""
        listings = []
        soup = BeautifulSoup(html, "html.parser")
        domain = urlparse(url).netloc.lower()

        if "yellowpages.com.au" in domain:
            # Yellow Pages AU listing selectors
            cards = soup.select(".search-contact, .listing, div[class*='listing-card']")
            for card in cards:
                try:
                    name_el = card.select_one(".listing-name, h3, a[class*='name']")
                    name = name_el.get_text(strip=True) if name_el else ""
                    if not name:
                        continue

                    phone_el = card.select_one(".contact-phone, a[href^='tel:']")
                    phone = phone_el.get_text(strip=True) if phone_el else ""
                    if not phone and phone_el and phone_el.has_attr("href"):
                        phone = phone_el["href"].replace("tel:", "").strip()

                    web_el = card.select_one("a[class*='website'], a[href*='http']")
                    website = ""
                    if web_el and web_el.has_attr("href"):
                        href = web_el["href"]
                        if "yellowpages.com.au" not in href:
                            website = href

                    address_el = card.select_one(".contact-address, .address")
                    address = address_el.get_text(strip=True) if address_el else ""

                    suburb = ""
                    if address:
                        parts = [p.strip() for p in address.split(",")]
                        if len(parts) > 1:
                            suburb = parts[-2]

                    listings.append({
                        "business_name": name,
                        "website_url": website,
                        "phone": phone,
                        "address": address,
                        "suburb": suburb,
                        "profile_url": "",
                    })
                except Exception:
                    continue

        elif "yelp.com" in domain or "yelp.com.au" in domain:
            # Yelp listings
            cards = soup.select("div[class*='container']")
            for card in cards:
                try:
                    name_el = card.select_one("h3 a")
                    if not name_el:
                        continue
                    name = name_el.get_text(strip=True)
                    profile_url = urljoin(url, name_el["href"])

                    listings.append({
                        "business_name": name,
                        "website_url": "",
                        "phone": "",
                        "address": "",
                        "suburb": "",
                        "profile_url": profile_url,
                    })
                except Exception:
                    continue

        # If domain specific extractor found nothing, fallback to generic links
        if not listings:
            listings = self._extract_generic(soup, url)

        return listings

    def _extract_generic(self, soup: BeautifulSoup, url: str) -> list[dict]:
        """Generic selector fallback to extract listing domains."""
        listings = []
        # Find external anchor links that aren't typical bad/social domains
        ignore_keywords = ["google", "facebook", "twitter", "yelp", "yellowpages", "instagram", "youtube", "linkedin", "tiktok", "apple", "microsoft", "wikipedia"]
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if href.startswith("http"):
                parsed = urlparse(href)
                domain = parsed.netloc.lower()
                if not any(ign in domain for ign in ignore_keywords):
                    name = a.get_text(strip=True)
                    if len(name) > 3 and len(name) < 60:
                        listings.append({
                            "business_name": name,
                            "website_url": href,
                            "phone": "",
                            "address": "",
                            "suburb": "",
                            "profile_url": "",
                        })
        return listings

    def _extract_scrapegraph(self, url: str) -> list[dict]:
        """Call ScrapeGraphAI as directory extraction fallback."""
        try:
            from scrapegraphai.graphs import SmartScraperGraph
            from src.config import config
            
            graph_config = {
                **config.get_llm_config(),
                **config.get_embeddings_config(),
                "headless": True,
            }
            prompt = (
                "Extract all business listings shown on this page. "
                "For each business return: business_name, phone, website_url, address, suburb. "
                "Return all listings on the page (up to 15 results) as a JSON list."
            )
            result = SmartScraperGraph(
                prompt=prompt,
                source=url,
                config=graph_config
            ).run()
            
            if isinstance(result, list):
                return result
            elif isinstance(result, dict):
                return (
                    result.get("listings") or result.get("businesses") or
                    result.get("results") or result.get("items") or []
                )
        except Exception as e:
            print(f"[DirectoryCrawler] ScrapeGraphAI fallback failed for {url}: {e}")
        return []
