"""
URLClassifierService — classify URLs as official business websites, directory pages, or bad URLs.

Directories are discovery sources (extract business names + websites from them),
not leads themselves. Official business websites are the actual lead targets.
"""

from urllib.parse import urlparse
from typing import Literal

URLClassification = Literal["business_website", "directory", "bad", "unknown"]

# Domains that are known directories or listing sites (by country).
# These are discovery sources, NOT lead targets.
_DIRECTORY_DOMAINS = {
    # Global
    "yelp.com", "yelp.com.au", "yelp.co.uk",
    "foursquare.com",
    # Australia
    "yellowpages.com.au", "truelocal.com.au", "whitepages.com.au",
    "localsearch.com.au", "localbusinessguide.com.au",
    "hotfrog.com.au", "startlocal.com.au", "whereis.com", "dlook.com.au",
    "wordofmouth.com.au", "australianplanet.com",
    # US
    "yellowpages.com", "whitepages.com", "yp.com",
    "thumbtack.com", "angi.com", "bbb.org",
    # UK
    "yell.com", "thomsonlocal.com", "checkatrade.com",
    "ratedpeople.com", "mybuilder.com",
    # Booking/profile platforms (single business pages, not directories)
    "fresha.com", "bookwell.com.au", "timelyapp.com",
    "squareup.com", "booksy.com",
    # Review/aggregator
    "productreview.com.au", "trustpilot.com",
}

# Domains that should be completely ignored (no value for lead discovery).
_BAD_DOMAINS = {
    "facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com",
    "linkedin.com", "pinterest.com", "youtube.com", "reddit.com",
    "seek.com.au", "seek.com", "indeed.com", "indeed.com.au",
    "jora.com", "jora.com.au", "careerone.com.au",
    "news.com.au", "smh.com.au", "dailymail.com.au",
    "tripadvisor.com", "tripadvisor.com.au", "tripadvisor.co.uk",
    "github.com", "gitlab.com",
    "wikipedia.org", "wikimedia.org",
    "amazon.com", "amazon.com.au",
    "ebay.com", "ebay.com.au",
    "shopify.com", "wix.com", "squarespace.com",
    "wordpress.com", "blogger.com",
    "medium.com", "tumblr.com",
    "spotify.com", "soundcloud.com",
    "whatsapp.com", "telegram.org",
    "zoom.us", "teams.microsoft.com",
    "canva.com", "figma.com",
    "google.com", "google.com.au", "google.co.uk",
    "maps.google.com", "maps.apple.com",
    # Known placeholder / parking domains
    "godaddy.com", "namecheap.com",
    "parkingcrew.net", "sedoparking.com",
}


class URLClassifierService:
    """Classify a URL as a business website, directory page, or bad URL."""

    def classify(self, url: str) -> URLClassification:
        """
        Classify a URL.

        Returns:
            "business_website" — an official business website worth scraping
            "directory" — a listing page to extract business websites from
            "bad" — ignore completely
            "unknown" — unclear, treat as business_website for now
        """
        if not url or not isinstance(url, str):
            return "bad"

        url = url.strip()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower().lstrip("www.")
        except Exception:
            return "bad"

        # Check bad domains first (highest priority)
        if self._is_bad_domain(domain):
            return "bad"

        # Check directory domains
        if self._is_directory_domain(domain):
            return "directory"

        # Check for directory-like URL patterns
        if self._looks_like_directory_path(parsed):
            return "directory"

        # Default: treat as business website
        return "business_website"

    def classify_many(self, urls: list[str]) -> dict[str, list[str]]:
        """Classify a list of URLs and return grouped results."""
        result = {
            "business_website": [],
            "directory": [],
            "bad": [],
            "unknown": [],
        }
        for url in urls:
            classification = self.classify(url)
            result[classification].append(url)
        return result

    def _is_bad_domain(self, domain: str) -> bool:
        """Check if domain is in the bad domains list."""
        # Exact match
        if domain in _BAD_DOMAINS:
            return True
        # Subdomain match (e.g. blog.wordpress.com)
        for bad in _BAD_DOMAINS:
            if domain.endswith("." + bad):
                return True
        return False

    def _is_directory_domain(self, domain: str) -> bool:
        """Check if domain is a known directory/listing site."""
        if domain in _DIRECTORY_DOMAINS:
            return True
        for d in _DIRECTORY_DOMAINS:
            if domain.endswith("." + d):
                return True
        return False

    def _looks_like_directory_path(self, parsed) -> bool:
        """Check if the URL path looks like a search/listing page."""
        path = parsed.path.lower()
        query = parsed.query.lower()

        directory_path_keywords = [
            "/search", "/listing", "/directory", "/results",
            "/category/", "/businesses/", "/find/",
        ]
        directory_query_keywords = [
            "search", "listing", "directory", "results",
            "category", "businesses",
        ]

        if any(kw in path for kw in directory_path_keywords):
            return True
        if any(kw in query for kw in directory_query_keywords):
            return True

        return False
