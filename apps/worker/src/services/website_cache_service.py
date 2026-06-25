"""
WebsiteCacheService — cache scraped website data to avoid re-scraping.

Before crawling any website, check the cache.
If the domain was scraped within the last 7 days, reuse the cached data.
"""

import hashlib
import json
import os
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional


@dataclass
class CacheEntry:
    domain: str
    url: str
    last_scraped_at: float  # Unix timestamp
    html_hash: str
    emails: list[str] = field(default_factory=list)
    phones: list[str] = field(default_factory=list)
    schema_data: dict = field(default_factory=dict)
    business_name: Optional[str] = None
    suburb: Optional[str] = None
    address: Optional[str] = None
    services: Optional[str] = None
    social_links: list[str] = field(default_factory=list)
    crawl_status: str = "success"  # success, failed, partial
    confidence_score: float = 0.0
    pages_scraped: list[str] = field(default_factory=list)


class WebsiteCacheService:
    """File-based cache for scraped website data.

    Uses a JSON file per domain for simplicity (no database needed).
    Cache directory: <worker_src>/data/cache/websites/
    """

    CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days

    def __init__(self, cache_dir: Optional[str] = None):
        if cache_dir:
            self._cache_dir = Path(cache_dir)
        else:
            self._cache_dir = Path(__file__).parent.parent / "data" / "cache" / "websites"
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def get(self, url: str) -> Optional[CacheEntry]:
        """Retrieve a cached entry for a URL if it's still fresh."""
        domain = self._extract_domain(url)
        if not domain:
            return None

        cache_file = self._cache_dir / f"{self._safe_filename(domain)}.json"
        if not cache_file.exists():
            return None

        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            entry = CacheEntry(**data)

            # Check TTL
            age = time.time() - entry.last_scraped_at
            if age > self.CACHE_TTL_SECONDS:
                return None  # Expired

            return entry
        except (json.JSONDecodeError, OSError, TypeError, KeyError):
            return None

    def put(self, entry: CacheEntry):
        """Save a cache entry to disk."""
        domain = self._extract_domain(entry.url)
        if not domain:
            return

        cache_file = self._cache_dir / f"{self._safe_filename(domain)}.json"
        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(asdict(entry), f, indent=2, default=str)
        except OSError as e:
            print(f"[WebsiteCacheService] Failed to write cache for {domain}: {e}")

    def invalidate(self, url: str):
        """Remove a cached entry."""
        domain = self._extract_domain(url)
        if not domain:
            return

        cache_file = self._cache_dir / f"{self._safe_filename(domain)}.json"
        if cache_file.exists():
            try:
                cache_file.unlink()
            except OSError:
                pass

    def compute_html_hash(self, html: str) -> str:
        """Compute a hash of HTML content to detect changes."""
        return hashlib.md5(html.encode("utf-8", errors="replace")).hexdigest()

    def is_cache_hit(self, url: str, current_html_hash: str) -> bool:
        """Check if cached content matches current HTML (no change since last scrape)."""
        entry = self.get(url)
        if not entry:
            return False
        return entry.html_hash == current_html_hash

    def clear_expired(self) -> int:
        """Remove all expired cache entries. Returns count removed."""
        removed = 0
        for cache_file in self._cache_dir.glob("*.json"):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                entry = CacheEntry(**data)
                age = time.time() - entry.last_scraped_at
                if age > self.CACHE_TTL_SECONDS:
                    cache_file.unlink()
                    removed += 1
            except (json.JSONDecodeError, OSError, TypeError, KeyError):
                cache_file.unlink()
                removed += 1
        return removed

    def stats(self) -> dict:
        """Return cache statistics."""
        total = 0
        valid = 0
        expired = 0
        now = time.time()

        for cache_file in self._cache_dir.glob("*.json"):
            total += 1
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                age = now - data.get("last_scraped_at", 0)
                if age <= self.CACHE_TTL_SECONDS:
                    valid += 1
                else:
                    expired += 1
            except Exception:
                expired += 1

        return {"total": total, "valid": valid, "expired": expired}

    @staticmethod
    def _extract_domain(url: str) -> Optional[str]:
        """Extract the domain from a URL."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc.lower().lstrip("www.")
            return domain if domain else None
        except Exception:
            return None

    @staticmethod
    def _safe_filename(domain: str) -> str:
        """Convert a domain to a safe filename."""
        return domain.replace(".", "_").replace("/", "_").replace(":", "_")


# Singleton
website_cache = WebsiteCacheService()
