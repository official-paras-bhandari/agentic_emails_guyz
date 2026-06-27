"""Deterministic business name normalisation used by extraction and dedupe."""

import re
import unicodedata
from typing import Optional


LEGAL_SUFFIX_PATTERNS = [
    r"pty\.?\s+ltd\.?",
    r"proprietary\s+limited",
    r"ltd\.?",
    r"limited",
    r"llc",
    r"inc\.?",
    r"&\s*co\.?",
    r"and\s+co\.?",
    r"co\.?",
    r"company",
    r"corp\.?",
    r"corporation",
    r"plc",
    r"gmbh",
]

FILLER_WORDS = {"the"}


def normalize_business_name(name: Optional[str]) -> Optional[str]:
    if not name:
        return None

    text = unicodedata.normalize("NFKD", str(name))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    previous = None
    while text and text != previous:
        previous = text
        for pattern in LEGAL_SUFFIX_PATTERNS:
            text = re.sub(rf"(?:^|\s){pattern}$", "", text).strip()
        text = re.sub(r"\s+", " ", text).strip()

    words = [word for word in text.split() if word not in FILLER_WORDS]
    normalized = " ".join(words).strip()
    return normalized or None
