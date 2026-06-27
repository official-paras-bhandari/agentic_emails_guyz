"""
LocationExpansionService — expands a target location into suburbs for broader search coverage.

Uses static JSON files (no API cost, instant, stable).
Falls back to the city itself + keywords if no suburb file found.
"""

import json
import os
import re
from typing import Dict, Any, List, Optional
from pathlib import Path

# Map of known city names → suburb JSON file path
# Keys are lowercase city names; values are relative paths from this module's directory
_LOCATION_FILES = {
    # Australia — NSW
    "sydney": "locations/australia/nsw/sydney.json",
    "sydney cbd": "locations/australia/nsw/sydney.json",
    # Australia — VIC
    "melbourne": "locations/australia/vic/melbourne.json",
    "melbourne cbd": "locations/australia/vic/melbourne.json",
    # Australia — QLD
    "brisbane": "locations/australia/qld/brisbane.json",
    "brisbane cbd": "locations/australia/qld/brisbane.json",
}

# Known state/country keywords to help detect which country file to use
_AU_STATE_KEYWORDS = {"nsw", "vic", "qld", "wa", "sa", "tas", "act", "nt",
                      "new south wales", "victoria", "queensland",
                      "western australia", "south australia", "tasmania"}


class LocationExpansionService:
    """Expand a location string into a list of suburbs + the city itself."""

    def __init__(self, data_dir: Optional[str] = None):
        if data_dir:
            self._data_dir = Path(data_dir)
        else:
            # __file__ is in .../worker/src/services/location_expansion_service.py
            # data dir is at .../worker/src/data/
            self._data_dir = Path(__file__).parent.parent / "data"

    def expand(self, location: str) -> Dict[str, Any]:
        """
        Expand a location string into structured search targets.

        Returns:
            {
                "city": str or None,
                "state": str or None,
                "country": str or None,
                "suburbs": [str, ...],
                "keywords": [str, ...],       # region-level keywords like "inner west"
                "search_targets": [str, ...], # suburbs + city + keywords combined
                "structured": bool            # true if we loaded a static config file
            }
        """
        loc = location.strip()

        # Try to find a matching city file
        city_data = self._find_city_data(loc)

        if city_data:
            suburbs = city_data.get("suburbs", [])
            keywords = city_data.get("keywords", [])
            city = city_data.get("city", loc)
            state = city_data.get("state")
            country = city_data.get("country", "Australia")
            structured = True
        else:
            # No static file — fall back to the location itself
            suburbs = [loc]
            keywords = []
            city = loc
            state = None
            country = None
            structured = False

        # Build search targets: each suburb, the city, and keyword phrases
        search_targets = []
        for suburb in suburbs:
            search_targets.append(suburb)
        if city and city not in suburbs:
            search_targets.append(city)
        search_targets.extend(keywords)

        # Deduplicate (case-insensitive) while preserving order
        seen = set()
        unique_targets = []
        for t in search_targets:
            t_lower = t.lower()
            if t_lower not in seen:
                seen.add(t_lower)
                unique_targets.append(t)

        return {
            "city": city,
            "state": state,
            "country": country,
            "suburbs": suburbs,
            "keywords": keywords,
            "search_targets": unique_targets,
            "structured": structured,
        }

    def _find_city_data(self, location: str) -> Optional[Dict[str, Any]]:
        """Find a matching city JSON file for the given location string."""
        loc_lower = location.lower()

        # Direct match
        if loc_lower in _LOCATION_FILES:
            return self._load_city(_LOCATION_FILES[loc_lower])

        # Partial match — check if location contains a known city
        for city_key, file_path in _LOCATION_FILES.items():
            if city_key in loc_lower or loc_lower in city_key:
                return self._load_city(file_path)

        # Check if location mentions a known suburb — infer city from that
        for city_key, file_path in _LOCATION_FILES.items():
            city_data = self._load_city(file_path)
            if city_data:
                suburbs_lower = [s.lower() for s in city_data.get("suburbs", [])]
                keywords_lower = [k.lower() for k in city_data.get("keywords", [])]
                all_names = suburbs_lower + keywords_lower + [city_key]
                if any(name in loc_lower for name in all_names):
                    return city_data

        return None

    def _load_city(self, relative_path: str) -> Optional[Dict[str, Any]]:
        """Load a city JSON file from the data directory."""
        full_path = self._data_dir / relative_path
        if not full_path.exists():
            return None
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    def is_australian_location(self, location: str) -> bool:
        """Quick check if location appears to be in Australia."""
        loc_lower = location.lower()
        if any(kw in loc_lower for kw in _AU_STATE_KEYWORDS):
            return True
        # Check if it matches any Australian city
        for city_key in _LOCATION_FILES:
            if city_key in loc_lower or loc_lower in city_key:
                return True
        return False

    def get_proximity_groups(self, suburb: str, city_data: Optional[Dict[str, Any]] = None) -> List[List[str]]:
        """Get proximity priority groups for suburb expansion (Section 9.2)."""
        sub_lower = suburb.lower().strip()
        if sub_lower in _PROXIMITY_MAP:
            return _PROXIMITY_MAP[sub_lower]
        
        # Generic index distance fallback (Section 9.2)
        if city_data:
            suburbs = city_data.get("suburbs", [])
            suburbs_lower = [s.lower().strip() for s in suburbs]
            if sub_lower in suburbs_lower:
                idx = suburbs_lower.index(sub_lower)
                groups = []
                max_dist = len(suburbs)
                current_group = []
                for dist in range(1, max_dist):
                    if idx - dist >= 0:
                        current_group.append(suburbs[idx - dist])
                    if idx + dist < len(suburbs):
                        current_group.append(suburbs[idx + dist])
                    if len(current_group) >= 2 or dist == max_dist - 1:
                        if current_group:
                            groups.append(current_group)
                            current_group = []
                return groups
        return []


_PROXIMITY_MAP = {
    "campsie": [
        ["Belmore", "Lakemba"],
        ["Canterbury", "Earlwood"],
        ["Ashfield", "Burwood"],
        ["Bankstown", "Strathfield"]
    ],
    "bondi": [
        ["Bondi Junction", "Bronte", "Tamarama"],
        ["Double Bay", "Rose Bay", "Clovelly"],
        ["Coogee", "Randwick", "Paddington"]
    ]
}


class LocationScopeDecider:
    """Decides if the search location is exact_suburb, nearby, metro, or state (Section 8)."""

    @staticmethod
    def decide(prompt: str, location_raw: str) -> str:
        p = prompt.lower()
        loc = location_raw.lower().strip()

        # Check for nearby keywords in the prompt or location
        if any(w in p for w in ["near ", "around ", "nearby ", "close to "]) or any(w in loc for w in ["near ", "around ", "nearby ", "close to "]):
            return "nearby"

        # Check if the location matches a known state
        states = {"nsw", "vic", "qld", "wa", "sa", "tas", "act", "nt",
                  "new south wales", "victoria", "queensland",
                  "western australia", "south australia", "tasmania"}
        if loc in states:
            return "state"

        # Check if the location matches a known city/metro
        cities = {"sydney", "melbourne", "brisbane", "sydney cbd", "melbourne cbd", "brisbane cbd"}
        if loc in cities:
            return "metro"

        return "exact_suburb"


# Singleton for convenience
location_expander = LocationExpansionService()
location_scope_decider = LocationScopeDecider()

