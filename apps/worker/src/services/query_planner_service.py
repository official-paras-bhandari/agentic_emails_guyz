"""
QueryPlannerService — generates targeted search queries from industry + expanded locations.

Produces ~80 queries from an industry and list of suburbs/keywords.
Queries are structured to find official business websites, not directory listings.
"""

from typing import Dict, Any, List


# Query templates that rotate phrasing to get different search results.
# Each template uses {industry} and {location} placeholders.
_DIRECT_WEBSITE_TEMPLATES = [
    "{industry} in {location} official website",
    "{industry} {location} contact email",
    "{industry} {location} website",
    "best {industry} in {location}",
    "{industry} {location} phone email",
    "{industry} near {location}",
    "{industry} {location} booking",
    "top {industry} {location}",
    "{industry} services {location}",
    "{industry} {location} australia",
]

# Templates specifically for directory discovery (used as fallback).
_DIRECTORY_TEMPLATES = [
    "{industry} in {location} yellow pages",
    "{industry} {location} directory",
    "{industry} {location} listings",
]


class QueryPlannerService:
    """Generate a list of search queries for lead discovery."""

    def __init__(
        self,
        direct_templates: List[str] | None = None,
        directory_templates: List[str] | None = None,
        max_queries: int = 100,
    ):
        self.direct_templates = direct_templates or _DIRECT_WEBSITE_TEMPLATES
        self.directory_templates = directory_templates or _DIRECTORY_TEMPLATES
        self.max_queries = max_queries

    def plan(
        self,
        industry: str,
        expanded_location: Dict[str, Any],
        quantity: int = 10,
        include_directory_queries: bool = True,
    ) -> Dict[str, Any]:
        """
        Generate search queries for an industry and expanded location.

        Args:
            industry: The business type (e.g. "salon", "plumber").
            expanded_location: Output from LocationExpansionService.expand().
            quantity: Number of leads the user requested.
            include_directory_queries: Whether to include directory-finding queries.

        Returns:
            {
                "queries": [str, ...],         # All generated queries
                "direct_queries": [str, ...],  # Business website queries only
                "directory_queries": [str, ...],  # Directory queries only
                "total": int,
                "batch_size": int,             # Recommended batch size for rate limiting
            }
        """
        suburbs = expanded_location.get("suburbs", [])
        keywords = expanded_location.get("keywords", [])
        city = expanded_location.get("city", "")
        targets = expanded_location.get("search_targets", [])

        # Build direct queries — one template × each location target
        direct_queries = []
        for target in targets:
            for template in self.direct_templates:
                q = template.format(industry=industry, location=target).strip()
                if q:
                    direct_queries.append(q)

        # Build directory queries (optional)
        directory_queries = []
        if include_directory_queries:
            for target in targets:
                for template in self.directory_templates:
                    q = template.format(industry=industry, location=target).strip()
                    if q:
                        directory_queries.append(q)

        # If we have too many queries, trim intelligently:
        # Keep direct queries first (higher value), then directory queries
        all_queries = direct_queries + directory_queries

        if len(all_queries) > self.max_queries:
            # Prioritise: direct queries for suburbs first, then city, then keywords
            priority_direct = direct_queries[: self.max_queries]
            remaining = self.max_queries - len(priority_direct)
            priority_dir = directory_queries[:remaining] if remaining > 0 else []
            all_queries = priority_direct + priority_dir
            direct_queries = priority_direct
            directory_queries = priority_dir

        # Also add a few broad queries at the start for coverage
        broad_queries = [
            f"{industry} in {city} official website",
            f"{industry} {city} contact",
            f"best {industry} {city}",
        ]
        # Deduplicate broad queries into the list
        seen = set()
        final_queries = []
        for q in broad_queries + all_queries:
            q_lower = q.lower()
            if q_lower not in seen:
                seen.add(q_lower)
                final_queries.append(q)

        # Enforce max_queries after adding broad queries
        if len(final_queries) > self.max_queries:
            final_queries = final_queries[: self.max_queries]

        # Recalculate direct vs directory after dedup
        broad_set = set(b.lower() for b in broad_queries)
        direct_set = set(d.lower() for d in direct_queries)
        dir_set = set(d.lower() for d in directory_queries)

        final_direct = [q for q in final_queries if q.lower() in (direct_set | broad_set)]
        final_dir = [q for q in final_queries if q.lower() in dir_set]

        # Batch size: 10 queries per batch for rate limiting
        batch_size = 10

        return {
            "queries": final_queries,
            "direct_queries": final_direct,
            "directory_queries": final_dir,
            "total": len(final_queries),
            "batch_size": batch_size,
        }

    def queries_for_quantity(self, quantity: int) -> int:
        """Estimate how many queries are needed for a given lead quantity.

        Rule of thumb: need ~2× queries as leads because many URLs are duplicates
        or directories. Cap at max_queries.
        """
        estimated = min(quantity * 2, self.max_queries)
        return max(estimated, 20)  # at least 20 queries even for small quantities
