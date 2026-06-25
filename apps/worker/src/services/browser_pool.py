"""
BrowserPool — manages headless browser instances and contexts for efficient crawling.
Prevents memory leaks, blocks unnecessary assets, and handles page load timeouts.
"""

import time
from urllib.parse import urlparse, urljoin
from typing import Dict, List, Optional
from playwright.sync_api import sync_playwright, Browser, BrowserContext

class BrowserPool:
    """Manages reusable headless browser context pool."""

    def __init__(self, max_pages_per_domain: int = 5, page_timeout_sec: int = 10, **kwargs):
        self.playwright = None
        self.browser = None
        self.domains_crawled = 0
        self.max_domains_before_restart = 40
        self.max_pages_per_domain = max_pages_per_domain
        self.page_timeout_ms = page_timeout_sec * 1000

    def fetch_page(self, url: str) -> Optional[str]:
        """Fetch HTML content of a single page."""
        browser = self.get_browser()
        context = None
        try:
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            context.set_default_timeout(self.page_timeout_ms)
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=self.page_timeout_ms)
            content = page.content()
            page.close()
            return content
        except Exception as e:
            print(f"[BrowserPool] Error fetching page {url}: {e}")
            return None
        finally:
            if context:
                try:
                    context.close()
                except Exception:
                    pass

    def get_browser(self) -> Browser:
        """Launch or return existing browser instance."""
        if not self.playwright:
            self.playwright = sync_playwright().start()
        if not self.browser or not self.browser.is_connected():
            self.browser = self.playwright.chromium.launch(
                headless=True,
                args=[
                    "--disable-gpu",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-extensions",
                ]
            )
        return self.browser

    def crawl_domain(self, base_url: str) -> Dict[str, str]:
        """
        Crawl up to max_pages_per_domain pages of a business website.
        Blocks images/fonts/media.
        Returns a map of page_type/url -> HTML content.
        """
        browser = self.get_browser()
        context = None
        pages_content = {}
        
        # Priority sub-page keywords
        priority_keywords = [
            "contact", "contact-us", "get-in-touch", "about", "about-us",
            "team", "staff", "locations", "location", "services", "book", "visit"
        ]

        start_time = time.time()
        max_total_crawl_time = 45.0  # Section 16.2

        try:
            # Create isolated context for each domain
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            context.set_default_timeout(self.page_timeout_ms)

            # Asset Blocking (Section 16.3)
            # Block images, videos, fonts, ads, analytics scripts, tracking pixels
            blocked_resource_types = {"image", "media", "font", "stylesheet", "other"}
            blocked_url_keywords = {"google-analytics", "analytics", "pixel", "facebook", "doubleclick", "adservice"}

            def handle_route(route):
                req = route.request
                res_type = req.resource_type
                url = req.url.lower()
                
                if res_type in blocked_resource_types or any(kw in url for kw in blocked_url_keywords):
                    route.abort()
                else:
                    route.continue_()

            context.route("**/*", handle_route)

            # Load homepage
            homepage = context.new_page()
            homepage.goto(base_url, wait_until="domcontentloaded", timeout=self.page_timeout_ms)
            pages_content["homepage"] = homepage.content()

            # Discover internal links (Section 16.4)
            links = homepage.eval_on_selector_all("a[href]", "elements => elements.map(el => el.href)")
            homepage.close()

            # Filter & prioritize internal links
            internal_urls = self._filter_and_prioritize_links(base_url, links, priority_keywords)
            # homepage counts as 1 page, so crawl max 4 more pages
            links_to_crawl = internal_urls[:self.max_pages_per_domain - 1]

            for link in links_to_crawl:
                # Enforce total crawl timeout per domain (Section 16.2)
                if time.time() - start_time > max_total_crawl_time:
                    print(f"[BrowserPool] Total crawl timeout reached for {base_url}")
                    break

                try:
                    page = context.new_page()
                    page.goto(link, wait_until="domcontentloaded", timeout=self.page_timeout_ms)
                    
                    # Deduce page type for caching/reporting
                    page_type = self._get_page_type_name(link)
                    pages_content[page_type] = page.content()
                    
                    page.close()
                except Exception as e:
                    print(f"[BrowserPool] Failed to crawl page {link}: {e}")

            self.domains_crawled += 1
            if self.domains_crawled >= self.max_domains_before_restart:
                self.restart_browser()

        except Exception as e:
            print(f"[BrowserPool] Error crawling domain {base_url}: {e}")
        finally:
            if context:
                try:
                    context.close()
                except Exception:
                    pass

        return pages_content

    def _filter_and_prioritize_links(self, base_url: str, links: List[str], priority_keywords: List[str]) -> List[str]:
        """Normalize, deduplicate, and prioritize internal links containing keywords."""
        parsed_base = urlparse(base_url)
        base_domain = parsed_base.netloc.lower().replace("www.", "")
        
        seen = {base_url.rstrip("/")}
        priority_links = []
        other_links = []

        for link in links:
            if not link or not isinstance(link, str):
                continue
            link = link.strip().split("#")[0].rstrip("/")
            if not link or link in seen:
                continue

            try:
                parsed_link = urlparse(link)
                link_domain = parsed_link.netloc.lower().replace("www.", "")
                
                # Check if it's an internal link
                if link_domain and link_domain != base_domain and not link_domain.endswith("." + base_domain):
                    continue
                
                # Normalize relative links
                if not parsed_link.netloc:
                    link = urljoin(base_url, link)
                
                seen.add(link)
                path = parsed_link.path.lower()
                
                if any(kw in path for kw in priority_keywords):
                    priority_links.append(link)
                else:
                    other_links.append(link)
            except Exception:
                continue

        return priority_links + other_links

    def _get_page_type_name(self, url: str) -> str:
        """Deduce simple page type name from URL path."""
        path = urlparse(url).path.lower()
        if "contact" in path:
            return "contact"
        if "about" in path:
            return "about"
        if "team" in path or "staff" in path:
            return "team"
        if "location" in path:
            return "location"
        if "services" in path:
            return "services"
        return "internal"

    def restart_browser(self):
        """Close current browser to clean memory and release resources."""
        if self.browser:
            try:
                self.browser.close()
            except Exception:
                pass
            self.browser = None
        self.domains_crawled = 0

    def shutdown(self):
        """Shutdown the browser and playwright instance completely."""
        self.restart_browser()
        if self.playwright:
            try:
                self.playwright.stop()
            except Exception:
                pass
            self.playwright = None

# Global instance for browser reuse across workers
browser_pool = BrowserPool()
