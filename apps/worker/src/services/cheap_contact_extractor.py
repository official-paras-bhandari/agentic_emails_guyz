"""
CheapContactExtractor — extract contact info from HTML without using an LLM.

Fast, deterministic extraction using:
  - mailto: links
  - regex email patterns
  - JSON-LD / schema.org structured data
  - footer scanning
  - /contact, /about, /services page scanning
  - social link extraction
  - phone number extraction

Returns structured data in < 1 second per page (no LLM call).
"""

import json
import re
from typing import Optional
from urllib.parse import urljoin, urlparse


# Common email prefixes that indicate a real business email
_ROLE_PREFIXES = {"info", "hello", "contact", "bookings", "admin", "sales", "support", "enquiries", "office", "reception"}
_GENERIC_PREFIXES = {"noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon"}

# Disposable email domains to reject
_DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.org", "guerrillamail.net",
    "guerrillamail.de", "guerrillamailblock.com", "sharklasers.com",
    "10minutemail.com", "tempmail.com", "throwaway.email",
    "yopmail.com", "fakeinbox.com", "maildrop.cc",
    "trashmail.com", "dispostable.com", "tempail.com",
}

# Phone regex — matches AU, US, UK formats
_PHONE_PATTERNS = [
    # AU: (02) 9000 1234, 0412 345 678, +61 2 9000 1234
    r'(?:\+61[\s\-]?)?(?:\([0-9]{2}\)|[0-9]{2})[\s\-]?[0-9]{4}[\s\-]?[0-9]{4}',
    # International: +1 234 567 8901, +44 20 1234 5678
    r'\+[0-9]{1,3}[\s\-]?[0-9]{2,4}[\s\-]?[0-9]{3,4}[\s\-]?[0-9]{3,4}',
    # Simple: 123-456-7890
    r'[0-9]{3}[\-\.][0-9]{3}[\-\.][0-9]{4}',
]

# Social media domains
_SOCIAL_DOMAINS = {
    "facebook.com", "instagram.com", "tiktok.com", "twitter.com", "x.com",
    "linkedin.com", "youtube.com", "pinterest.com", "snapchat.com",
}


class CheapContactExtractor:
    """Extract contact information from HTML without LLM."""

    def extract(self, html: str, base_url: str) -> dict:
        """
        Extract all contact info from HTML content.

        Args:
            html: Full HTML content of the page.
            base_url: The URL of the page (for resolving relative links).

        Returns:
            {
                "emails": [str, ...],
                "phones": [str, ...],
                "business_name": str or None,
                "social_links": [str, ...],
                "schema_data": dict,
                "source_page": str,  # which page the data came from
                "extraction_method": str,  # mailto, regex, schema, footer, contact_page
                "confidence_score": float,
            }
        """
        result = {
            "emails": [],
            "phones": [],
            "business_name": None,
            "social_links": [],
            "schema_data": {},
            "source_page": base_url,
            "extraction_method": "none",
            "confidence_score": 0.0,
        }

        # 1. Extract JSON-LD / schema.org data (highest confidence)
        schema_data = self._extract_schema(html)
        if schema_data:
            result["schema_data"] = schema_data
            result["emails"].extend(schema_data.get("emails", []))
            result["phones"].extend(schema_data.get("phones", []))
            result["business_name"] = schema_data.get("name") or result["business_name"]

        # 2. Extract mailto: links (very high confidence)
        mailto_emails = self._extract_mailto_links(html)
        if mailto_emails:
            result["emails"].extend(mailto_emails)
            result["extraction_method"] = "mailto"
            result["confidence_score"] = max(result["confidence_score"], 0.95)

        # 3. Extract emails via regex
        regex_emails = self._extract_email_regex(html)
        if regex_emails:
            result["emails"].extend(regex_emails)
            if result["extraction_method"] == "none":
                result["extraction_method"] = "regex"
                result["confidence_score"] = max(result["confidence_score"], 0.8)

        # 4. Extract phone numbers
        phones = self._extract_phones(html)
        if phones:
            result["phones"].extend(phones)

        # 5. Extract business name from common patterns
        if not result["business_name"]:
            result["business_name"] = self._extract_business_name(html, base_url)

        # 6. Extract social links
        result["social_links"] = self._extract_social_links(html, base_url)

        # 7. Deduplicate and clean
        result["emails"] = self._clean_emails(result["emails"])
        result["phones"] = self._deduplicate(result["phones"])

        # Boost confidence if multiple data points found
        if result["emails"] and result["phones"] and result["business_name"]:
            result["confidence_score"] = max(result["confidence_score"], 0.9)
        elif result["emails"] and result["business_name"]:
            result["confidence_score"] = max(result["confidence_score"], 0.85)

        return result

    def extract_from_pages(self, pages: dict[str, str], base_url: str) -> dict:
        """
        Extract contact info from multiple pages of the same website.

        Args:
            pages: Dict of {page_type: html_content}, e.g. {"homepage": "...", "contact": "..."}
            base_url: The website's base URL.

        Returns:
            Same structure as extract(), but aggregated across all pages.
        """
        aggregated = {
            "emails": [],
            "phones": [],
            "business_name": None,
            "social_links": [],
            "schema_data": {},
            "source_page": base_url,
            "extraction_method": "multi_page",
            "confidence_score": 0.0,
        }

        all_emails = set()
        all_phones = set()
        all_socials = set()

        for page_type, html in pages.items():
            page_url = self._resolve_page_url(base_url, page_type)
            page_result = self.extract(html, page_url)

            for email in page_result["emails"]:
                all_emails.add(email)
            for phone in page_result["phones"]:
                all_phones.add(phone)
            for link in page_result["social_links"]:
                all_socials.add(link)

            if page_result["schema_data"]:
                aggregated["schema_data"] = page_result["schema_data"]
            if page_result["business_name"] and not aggregated["business_name"]:
                aggregated["business_name"] = page_result["business_name"]

        aggregated["emails"] = sorted(all_emails)
        aggregated["phones"] = sorted(all_phones)
        aggregated["social_links"] = sorted(all_socials)

        # Confidence based on data completeness
        score = 0.0
        if aggregated["emails"]:
            score += 0.4
        if aggregated["phones"]:
            score += 0.2
        if aggregated["business_name"]:
            score += 0.2
        if aggregated["schema_data"]:
            score += 0.2
        aggregated["confidence_score"] = min(score, 1.0)

        return aggregated

    # ─── Individual extractors ────────────────────────────────────────────

    @staticmethod
    def _extract_mailto_links(html: str) -> list[str]:
        """Extract emails from mailto: links."""
        return re.findall(r'mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', html)

    @staticmethod
    def _extract_email_regex(html: str) -> list[str]:
        """Extract emails via regex from HTML text (not from href attributes)."""
        # Strip HTML tags for text-only matching
        text = re.sub(r'<[^>]+>', ' ', html)
        # Remove mailto: links (already handled separately)
        text = re.sub(r'mailto:[^\s>]+', '', text)
        emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        return emails

    @staticmethod
    def _extract_phones(html: str) -> list[str]:
        """Extract phone numbers from HTML."""
        phones = []
        text = re.sub(r'<[^>]+>', ' ', html)
        for pattern in _PHONE_PATTERNS:
            phones.extend(re.findall(pattern, text))
        return list(set(phones))

    @staticmethod
    def _extract_schema(html: str) -> dict:
        """Extract JSON-LD / schema.org structured data."""
        schema_data = {
            "emails": [],
            "phones": [],
            "name": None,
            "raw": {},
        }

        # Find all JSON-LD script tags
        patterns = re.findall(
            r'<script[^>]*type\s*=\s*["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html,
            re.DOTALL,
        )

        for raw_json in patterns:
            try:
                data = json.loads(raw_json)
                # Handle array of schemas
                if isinstance(data, list):
                    items = data
                elif isinstance(data, dict):
                    items = [data]
                else:
                    continue

                for item in items:
                    if not isinstance(item, dict):
                        continue

                    schema_data["raw"].update(item)
                    schema_data["name"] = item.get("name") or schema_data["name"]

                    # Extract email from schema
                    email = item.get("email")
                    if email:
                        schema_data["emails"].append(email)

                    # Extract phone from schema
                    phone = item.get("telephone") or item.get("phone")
                    if phone:
                        schema_data["phones"].append(phone)

                    # Check contactPoint
                    contact = item.get("contactPoint")
                    if isinstance(contact, dict):
                        if contact.get("email"):
                            schema_data["emails"].append(contact["email"])
                        if contact.get("telephone"):
                            schema_data["phones"].append(contact["telephone"])
                    elif isinstance(contact, list):
                        for cp in contact:
                            if isinstance(cp, dict):
                                if cp.get("email"):
                                    schema_data["emails"].append(cp["email"])
                                if cp.get("telephone"):
                                    schema_data["phones"].append(cp["telephone"])

            except json.JSONDecodeError:
                continue

        # Deduplicate
        schema_data["emails"] = list(set(schema_data["emails"]))
        schema_data["phones"] = list(set(schema_data["phones"]))

        return schema_data if schema_data["emails"] or schema_data["phones"] or schema_data["name"] else {}

    @staticmethod
    def _extract_business_name(html: str, base_url: str) -> Optional[str]:
        """Extract business name from HTML title, meta tags, or schema."""
        # Try og:site_name
        match = re.search(r'<meta[^>]*property\s*=\s*["\']og:site_name["\'][^>]*content\s*=\s*["\']([^"\']+)["\']', html)
        if match:
            return match.group(1).strip()

        # Try og:title
        match = re.search(r'<meta[^>]*property\s*=\s*["\']og:title["\'][^>]*content\s*=\s*["\']([^"\']+)["\']', html)
        if match:
            title = match.group(1).strip()
            # Remove common suffixes
            for suffix in [" | ", " - ", " — ", " :: "]:
                if suffix in title:
                    title = title.split(suffix)[0].strip()
            if title:
                return title

        # Try <title> tag
        match = re.search(r'<title[^>]*>(.*?)</title>', html, re.DOTALL)
        if match:
            title = re.sub(r'<[^>]+>', '', match.group(1)).strip()
            for suffix in [" | ", " - ", " — ", " :: "]:
                if suffix in title:
                    title = title.split(suffix)[0].strip()
            if title and len(title) < 80:
                return title

        return None

    @staticmethod
    def _extract_social_links(html: str, base_url: str) -> list[str]:
        """Extract social media profile links."""
        social_links = []
        hrefs = re.findall(r'href\s*=\s*["\']([^"\']+)["\']', html)

        for href in hrefs:
            full_url = urljoin(base_url, href) if href.startswith("/") else href
            try:
                parsed = urlparse(full_url)
                domain = parsed.netloc.lower().lstrip("www.")
                if any(sd in domain for sd in _SOCIAL_DOMAINS):
                    social_links.append(full_url)
            except Exception:
                continue

        return list(set(social_links))

    # ─── Cleaning / validation ────────────────────────────────────────────

    def _clean_emails(self, emails: list[str]) -> list[str]:
        """Clean and deduplicate emails, removing placeholders and disposables."""
        cleaned = []
        seen = set()
        for email in emails:
            e = email.strip().lower()
            if not e or e in seen:
                continue

            # Skip placeholders
            if e in {"na", "n/a", "none", "null", "no email", "not available",
                      "no@email.com", "placeholder@email.com", "undefined", "example.com"}:
                continue

            # Skip disposable domains
            domain = e.split("@")[-1] if "@" in e else ""
            if domain in _DISPOSABLE_DOMAINS:
                continue

            # Skip noreply addresses
            prefix = e.split("@")[0] if "@" in e else ""
            if prefix in _GENERIC_PREFIXES:
                continue

            # Basic format validation
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e):
                continue

            seen.add(e)
            cleaned.append(e)

        return cleaned

    @staticmethod
    def _deduplicate(items: list[str]) -> list[str]:
        return list(dict.fromkeys(items))  # preserves order

    @staticmethod
    def _resolve_page_url(base_url: str, page_type: str) -> str:
        """Resolve a page type to a full URL."""
        page_paths = {
            "homepage": "/",
            "contact": "/contact",
            "about": "/about",
            "services": "/services",
            "footer": "/",  # footer is part of every page
        }
        path = page_paths.get(page_type, f"/{page_type}")
        return urljoin(base_url, path)

    # ─── Classification helpers ───────────────────────────────────────────

    @staticmethod
    def is_role_email(email: str) -> bool:
        """Check if an email uses a generic role prefix."""
        prefix = email.split("@")[0].lower() if "@" in email else ""
        return prefix in _ROLE_PREFIXES

    @staticmethod
    def is_disposable_domain(email: str) -> bool:
        """Check if email uses a disposable domain."""
        domain = email.split("@")[-1].lower() if "@" in email else ""
        return domain in _DISPOSABLE_DOMAINS

    @staticmethod
    def get_best_email(emails: list[str]) -> Optional[str]:
        """Return the best email from a list, prioritising non-role addresses."""
        if not emails:
            return None

        # Prefer non-role emails
        non_role = [e for e in emails if not CheapContactExtractor.is_role_email(e)]
        if non_role:
            return non_role[0]

        # Fall back to role emails
        return emails[0]
