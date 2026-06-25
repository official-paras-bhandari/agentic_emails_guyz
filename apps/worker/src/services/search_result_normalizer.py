"""
SearchResultNormalizer — normalizes search result URLs to standard canonical formats.
Strips query tracking parameters, removes anchors, and normalizes trailing slashes.
"""

from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

class SearchResultNormalizer:
    """Cleans and standardizes URLs found during scraping."""

    @staticmethod
    def normalize(url: str) -> str:
        """
        Normalize URL format:
          - lowercase domain name
          - remove tracking query parameters (utm_*, fbclid, etc.)
          - remove trailing slash for domain roots
          - strip fragments/anchors (#section)
          - ensure http/https prefix
        """
        if not url or not isinstance(url, str):
            return ""

        url = url.strip()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        try:
            parsed = urlparse(url)
            netloc = parsed.netloc.lower()

            # Remove tracking params (Section 12)
            tracking_params = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "cx", "ie"}
            query_items = parse_qsl(parsed.query)
            clean_query_items = [(k, v) for k, v in query_items if k.lower() not in tracking_params]
            
            # Re-serialize query string
            query = urlencode(clean_query_items) if clean_query_items else ""

            # Reconstruct (Section 12: strip anchors)
            normalized = urlunparse((
                parsed.scheme,
                netloc,
                parsed.path,
                parsed.params,
                query,
                "" # empty fragment
            ))

            # Normalize trailing slash (Section 12)
            if normalized.endswith("/"):
                normalized = normalized.rstrip("/")

            return normalized
        except Exception:
            return url
