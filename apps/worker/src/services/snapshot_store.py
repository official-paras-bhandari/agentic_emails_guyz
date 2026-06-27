"""Local raw HTML snapshot storage for lead audit traceability."""

import hashlib
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin


class SnapshotStore:
    def __init__(self, base_dir: Optional[Path] = None):
        self.base_dir = base_dir or Path(__file__).resolve().parents[1] / "data" / "snapshots"

    def store_pages(
        self,
        job_id: str,
        base_url: str,
        pages: Dict[str, str],
        rendered: bool = False,
    ) -> List[Dict[str, Any]]:
        snapshots: List[Dict[str, Any]] = []
        for page_type, html in pages.items():
            if not html:
                continue
            content_hash = hashlib.sha256(html.encode("utf-8", errors="ignore")).hexdigest()
            job_dir = self.base_dir / self._safe_part(job_id)
            job_dir.mkdir(parents=True, exist_ok=True)
            suffix = "rendered" if rendered else "raw"
            file_path = job_dir / f"{content_hash}.{suffix}.html"
            if not file_path.exists():
                file_path.write_text(html, encoding="utf-8")

            page_url = self._page_url(base_url, page_type)
            snapshots.append({
                "url": page_url,
                "final_url": page_url,
                "content_hash": content_hash,
                "raw_html_storage_key": str(file_path) if not rendered else None,
                "rendered_html_storage_key": str(file_path) if rendered else None,
                "fetched_at": time.time(),
                "source_role": self._source_role(page_type, rendered),
                "evidence_types": self._evidence_types(html),
            })
        return snapshots

    @staticmethod
    def _safe_part(value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_.-]", "_", value or "unknown")

    @staticmethod
    def _page_url(base_url: str, page_type: str) -> str:
        if page_type == "homepage":
            return base_url
        if page_type.startswith("http://") or page_type.startswith("https://"):
            return page_type
        return urljoin(base_url.rstrip("/") + "/", page_type)

    @staticmethod
    def _source_role(page_type: str, rendered: bool = False) -> str:
        if rendered:
            return "rendered_page"
        lowered = page_type.lower()
        if "contact" in lowered:
            return "contact_page"
        if "about" in lowered:
            return "about_page"
        if "schema" in lowered:
            return "schema_source"
        if "directory" in lowered:
            return "directory_listing"
        return "primary_official_site"

    @staticmethod
    def _evidence_types(html: str) -> List[str]:
        lowered = html.lower()
        evidence = set()
        if re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", html):
            evidence.add("email")
        if re.search(r"(?:telephone|phone|call|tel:|\+?[0-9][0-9\s().-]{7,})", lowered):
            evidence.add("phone")
        if re.search(r"<title|og:site_name|application/ld\+json", lowered):
            evidence.add("business_name")
        if re.search(r"address|suburb|located|location", lowered):
            evidence.add("address")
            evidence.add("location")
        if re.search(r"services?|booking|treatment|hair|dental|clinic|salon|barber|spa", lowered):
            evidence.add("services")
            evidence.add("industry")
        evidence.add("website")
        return sorted(evidence)


snapshot_store = SnapshotStore()
