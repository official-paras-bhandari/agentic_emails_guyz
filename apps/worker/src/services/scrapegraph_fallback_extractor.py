"""
ScrapeGraphFallbackExtractor — evidence-gated LLM extraction for messy pages.

This service is intentionally a fallback. The deterministic extractor should run
first; ScrapeGraphAI is used only when the cheap result is weak enough to justify
the cost and latency.
"""

import json
import re
from typing import Any, Dict, Optional

from bs4 import BeautifulSoup

from src.config import config
from src.services.cheap_contact_extractor import CheapContactExtractor


class ScrapeGraphFallbackExtractor:
    """Run bounded ScrapeGraphAI extraction and reject unsupported fields."""

    def __init__(self, confidence_threshold: float = 0.75, max_chars: int = 12000):
        self.confidence_threshold = confidence_threshold
        self.max_chars = max_chars
        self._cleaner = CheapContactExtractor()

    def should_fallback(self, cheap_result: Dict[str, Any]) -> bool:
        """Return true when deterministic extraction is too weak."""
        confidence = float(cheap_result.get("confidence_score") or 0.0)
        return (
            not cheap_result.get("emails")
            or not cheap_result.get("business_name")
            or confidence < self.confidence_threshold
        )

    def extract(
        self,
        pages: Dict[str, str],
        url: str,
        industry: str,
        target_location: str,
        country: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Extract structured lead data from cleaned page text with evidence checks."""
        source_text = self._clean_pages(pages)
        if not source_text:
            return self._empty("no_page_text")

        llm_cfg = config.get_llm_config()
        if not llm_cfg.get("llm", {}).get("api_key"):
            return self._empty("fallback_unavailable")

        try:
            raw = self._run_scrapegraphai(
                source_text=source_text[: self.max_chars],
                url=url,
                industry=industry,
                target_location=target_location,
                country=country,
            )
        except Exception as error:
            print(f"[ScrapeGraphFallbackExtractor] fallback failed for {url}: {error}")
            return self._empty("fallback_error")

        return self._validate(raw, source_text, url)

    def _run_scrapegraphai(
        self,
        source_text: str,
        url: str,
        industry: str,
        target_location: str,
        country: Optional[str],
    ) -> Dict[str, Any]:
        """Call ScrapeGraphAI. Kept isolated so tests can patch it."""
        from scrapegraphai.graphs import SmartScraperGraph

        graph_config = {
            **config.get_llm_config(),
            **config.get_embeddings_config(),
            "headless": True,
        }
        prompt = f"""
Extract public business contact data for an outreach lead.

Target industry: {industry}
Target location: {target_location}
Target country: {country or "unknown"}
Website URL: {url}

Return ONLY JSON with this exact shape:
{{
  "businessName": "string|null",
  "email": "string|null",
  "phone": "string|null",
  "website": "string|null",
  "suburb": "string|null",
  "services": ["string"],
  "confidence": 0.0,
  "evidence": ["short source text snippets"]
}}

No hallucination: only include values visible in the source text. If a value is
not visible, return null. Include short evidence snippets for every non-null
value. If no reliable contact data is visible, return null fields.
        """.strip()
        result = SmartScraperGraph(prompt=prompt, source=source_text, config=graph_config).run()
        if isinstance(result, dict):
            return result
        if isinstance(result, str):
            try:
                parsed = json.loads(result)
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                return {}
        return {}

    def _validate(self, raw: Dict[str, Any], source_text: str, url: str) -> Dict[str, Any]:
        normalized_source = self._norm(source_text)
        evidence = self._clean_evidence(raw.get("evidence"))
        if not evidence:
            return self._empty("missing_evidence")

        email = self._clean_email(raw.get("email"), normalized_source)
        business_name = self._visible_text(raw.get("businessName") or raw.get("business_name"), normalized_source)
        phone = self._visible_text(raw.get("phone"), normalized_source)
        suburb = self._visible_text(raw.get("suburb"), normalized_source)
        services = [
            value
            for value in (raw.get("services") or [])
            if isinstance(value, str) and self._norm(value) in normalized_source
        ][:8]

        website = raw.get("website")
        if isinstance(website, str) and website.strip():
            website = website.strip()
            if self._norm(website) not in normalized_source and website.rstrip("/") != url.rstrip("/"):
                website = None
        else:
            website = url

        confidence = self._confidence(raw.get("confidence"))
        if not email and not website:
            return self._empty("no_email_and_no_website")

        return {
            "businessName": business_name,
            "email": email,
            "phone": phone,
            "website": website,
            "suburb": suburb,
            "services": services,
            "confidence": confidence,
            "evidence": evidence,
            "status": "ok",
        }

    def _clean_pages(self, pages: Dict[str, str]) -> str:
        chunks = []
        for page_type, html in pages.items():
            soup = BeautifulSoup(html or "", "html.parser")
            for tag in soup(["script", "style", "noscript", "svg"]):
                tag.decompose()
            text = re.sub(r"\s+", " ", soup.get_text(separator=" ", strip=True)).strip()
            if text:
                chunks.append(f"--- PAGE: {page_type} ---\n{text[:3000]}")
        return "\n".join(chunks)[: self.max_chars]

    def _clean_email(self, value: Any, normalized_source: str) -> Optional[str]:
        if not isinstance(value, str):
            return None
        cleaned = self._cleaner._clean_emails([value])
        if not cleaned:
            return None
        email = cleaned[0]
        return email if self._norm(email) in normalized_source else None

    @staticmethod
    def _visible_text(value: Any, normalized_source: str) -> Optional[str]:
        if not isinstance(value, str):
            return None
        text = re.sub(r"\s+", " ", value).strip()
        if not text:
            return None
        return text if ScrapeGraphFallbackExtractor._norm(text) in normalized_source else None

    @staticmethod
    def _clean_evidence(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        snippets = []
        for item in value:
            if isinstance(item, str):
                snippet = re.sub(r"\s+", " ", item).strip()
                if snippet:
                    snippets.append(snippet[:240])
        return snippets[:6]

    @staticmethod
    def _confidence(value: Any) -> float:
        try:
            return max(0.0, min(float(value), 1.0))
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _norm(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip().lower()

    @staticmethod
    def _empty(reason: str) -> Dict[str, Any]:
        return {
            "businessName": None,
            "email": None,
            "phone": None,
            "website": None,
            "suburb": None,
            "services": [],
            "confidence": 0.0,
            "evidence": [],
            "status": "skipped",
            "reason": reason,
        }
