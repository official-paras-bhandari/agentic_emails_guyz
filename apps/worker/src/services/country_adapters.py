"""Country adapter interface for local-language query expansion."""

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass(frozen=True)
class CountryAdapter:
    code: str
    languages: List[str]
    industry_synonyms_by_language: Dict[str, Dict[str, List[str]]] = field(default_factory=dict)
    location_aliases: Dict[str, List[str]] = field(default_factory=dict)
    query_templates_by_language: Dict[str, List[str]] = field(default_factory=dict)

    def industry_terms(self, industry: str, language: str) -> List[str]:
        normalized = industry.lower().strip()
        synonyms = self.industry_synonyms_by_language.get(language, {})
        return synonyms.get(normalized, [industry])

    def location_terms(self, location: str) -> List[str]:
        return [location] + self.location_aliases.get(location.lower().strip(), [])

    def templates(self, language: str, fallback: List[str]) -> List[str]:
        return self.query_templates_by_language.get(language) or fallback


GENERIC_ADAPTER = CountryAdapter(
    code="generic",
    languages=["en"],
    query_templates_by_language={"en": [
        "{industry} in {location} official website",
        "{industry} {location} contact email",
        "{industry} {location} website",
    ]},
)

COUNTRY_ADAPTERS: Dict[str, CountryAdapter] = {
    "au": GENERIC_ADAPTER,
    "australia": GENERIC_ADAPTER,
    "nepal": CountryAdapter(
        code="np",
        languages=["en", "ne"],
        industry_synonyms_by_language={
            "en": {"salon": ["salon", "beauty parlour", "hair salon"]},
            "ne": {"salon": ["कपाल काट्ने", "ब्युटी पार्लर"]},
        },
        query_templates_by_language={
            "en": ["{industry} in {location} official website", "{industry} {location} contact email"],
            "ne": ["{industry} {location}", "{industry} {location} सम्पर्क"],
        },
    ),
    "canada": CountryAdapter(
        code="ca",
        languages=["en", "fr"],
        industry_synonyms_by_language={
            "en": {"dentist": ["dentist", "dental clinic"]},
            "fr": {"dentist": ["dentiste", "clinique dentaire"]},
        },
        query_templates_by_language={
            "en": ["{industry} {location} official website", "{industry} {location} contact"],
            "fr": ["{industry} {location}", "{industry} {location} contact"],
        },
    ),
    "usa": CountryAdapter(
        code="us",
        languages=["en", "es"],
        industry_synonyms_by_language={
            "en": {"barber": ["barber", "barbershop"]},
            "es": {"barber": ["peluquería", "barbería"]},
        },
        query_templates_by_language={
            "en": ["{industry} {location} official website", "{industry} {location} contact"],
            "es": ["{industry} {location}", "{industry} {location} contacto"],
        },
    ),
}


def adapter_for_country(country: str | None) -> CountryAdapter:
    if not country:
        return GENERIC_ADAPTER
    return COUNTRY_ADAPTERS.get(country.lower().strip(), GENERIC_ADAPTER)
