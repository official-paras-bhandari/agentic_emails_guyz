"""
LeadQualityGate — validates, scores, and tiers a lead candidate before CRM save.
Implements syntax, MX validation, disposable domain checks, prefix priority,
and Section 22/22.1 quality scoring and source tier overrides.
"""

import re
from typing import Optional, Dict, Any, List

class LeadQualityGate:
    """Validate, score, and tier lead candidates."""

    def __init__(self):
        self._mx_cache: Dict[str, bool] = {}

    def evaluate(
        self,
        email: Optional[str],
        business_name: Optional[str],
        website: Optional[str],
        phone: Optional[str],
        suburb: Optional[str],
        industry: str,
        target_location: str,
        services: Optional[str] = None,
        confidence_score: float = 0.0,
        source_type: str = "direct_website",  # direct_website, directory_discovered_website, directory_only
        extraction_method: str = "cheap_extractor",  # cheap_extractor, scrapegraph_fallback
        address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Evaluate and score a lead.
        
        Returns:
            Quality metrics dict containing:
                passed, status, icp_score (0.0-1.0), quality_score (0-100), tier, blocks, flags
        """
        flags = []
        blocks = []

        # ── 1. Email checks ────────────────────────────────────────────
        email_valid = self._validate_email_syntax(email)
        is_disposable = False
        is_role_email = False
        mx_valid = False

        if email:
            email_clean = email.strip().lower()
            is_disposable = self._is_disposable(email_clean)
            is_role_email = self._is_role_email(email_clean)

            if is_disposable:
                blocks.append("disposable_email")
            if is_role_email:
                flags.append("role_email")

            # MX Record check (Section 19.2)
            if email_valid and not is_disposable:
                mx_valid = self._check_mx(email_clean)
                if not mx_valid:
                    blocks.append("no_mx_record") # Section 19.2: "Reject if no MX record exists."
        else:
            # If no email, check if we have enough fields to save as Tier C
            if not website:
                blocks.append("no_email_and_no_website")

        # ── 2. Industry & Location matching ─────────────────────────────
        industry_match = self._check_industry_match(industry, business_name, services, website)
        if not industry_match:
            flags.append("industry_mismatch")

        location_match = self._check_location_match(target_location, suburb, address, website)
        if not location_match:
            flags.append("location_mismatch")

        # ── 3. Quality Score & Tier Override (Section 22 & 22.1) ────────
        score = 0
        
        # Email points (+30)
        if email:
            score += 30
            if mx_valid:
                score += 15
            
            # Named email priority check (+10) (Section 19.4)
            priority = self._get_email_priority(email)
            if priority == 4: # Named email
                score += 10
                
        # Source type points (Section 22)
        if source_type == "direct_website":
            score += 15
        elif source_type == "directory_discovered_website":
            score += 10
        elif source_type == "directory_only":
            score -= 10

        # Match quality points (+15 each)
        if location_match:
            score += 15
        if industry_match:
            score += 15

        # Completeness points (+5 each)
        if phone:
            score += 5
        if address or suburb:
            score += 5

        # Extraction method modifier (-5)
        if extraction_method == "scrapegraph_fallback":
            score -= 5

        # Clamp quality score between 0 and 100
        quality_score = max(0, min(score, 100))

        # Assign Tier (Section 21 & 22)
        if not email:
            tier = "C"
        else:
            if quality_score >= 80:
                tier = "A"
            elif quality_score >= 55:
                tier = "B"
            else:
                # If email is valid but score is low, cap at B (since it has email)
                tier = "B"

        # Apply Tier Source Override Rules (Section 22.1)
        if email:
            # Rule 3: ScrapeGraphAI-only email extraction -> max Tier B
            if extraction_method == "scrapegraph_fallback":
                tier = "B"
            
            # Rule 4: Directory-only email without official website visit -> max Tier B
            if source_type == "directory_only":
                tier = "B"

            # Rule 6: No official website + no verified email -> cannot be Tier A (Tier C only if no email, but here we have email)
            if not website:
                tier = "B"

        # Check hard rejects for email prefix (Section 19.4)
        if email and self._get_email_priority(email) == 0:
            blocks.append("hard_reject_email_prefix")

        # ── 4. Determine status ────────────────────────────────────────
        if blocks:
            status = "fail"
            passed = False
        elif flags:
            status = "flag"
            passed = True
        else:
            status = "pass"
            passed = True

        return {
            "passed": passed,
            "status": status,
            "email_valid": email_valid,
            "mx_valid": mx_valid,
            "is_disposable": is_disposable,
            "is_role_email": is_role_email,
            "industry_match": industry_match,
            "location_match": location_match,
            "icp_score": round(quality_score / 100.0, 2), # mapped 0.0-1.0
            "quality_score": quality_score,
            "tier": tier,
            "flags": flags,
            "blocks": blocks,
            "details": {
                "email": email,
                "business_name": business_name,
                "website": website,
                "phone": phone,
                "suburb": suburb,
                "address": address,
                "industry": industry,
                "target_location": target_location,
            },
        }

    @staticmethod
    def _validate_email_syntax(email: Optional[str]) -> bool:
        """Validate email format (Section 19.1)."""
        if not email:
            return False
        return bool(re.match(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$", email))

    def _check_mx(self, email: str) -> bool:
        """Check if the email domain has valid MX records (Section 19.2)."""
        domain = email.split("@")[-1] if "@" in email else ""
        if not domain:
            return False

        if domain in self._mx_cache:
            return self._mx_cache[domain]

        try:
            import dns.resolver
            # Resolve MX records
            answers = dns.resolver.resolve(domain, "MX")
            has_mx = len(answers) > 0
            self._mx_cache[domain] = has_mx
            return has_mx
        except Exception:
            self._mx_cache[domain] = False
            return False

    @staticmethod
    def _is_disposable(email: str) -> bool:
        """Check if email uses a disposable domain (Section 19.3)."""
        from src.services.cheap_contact_extractor import CheapContactExtractor
        return CheapContactExtractor.is_disposable_domain(email)

    @staticmethod
    def _is_role_email(email: str) -> bool:
        """Check if email uses a generic role prefix."""
        from src.services.cheap_contact_extractor import CheapContactExtractor
        return CheapContactExtractor.is_role_email(email)

    @staticmethod
    def _get_email_priority(email: str) -> int:
        """Score email prefix from 0 (reject) to 4 (named) (Section 19.4)."""
        prefix = email.split("@")[0].lower()
        
        # Hard reject (Section 19.4)
        if prefix in {"noreply", "no-reply", "donotreply", "test", "do-not-reply", "mailer-daemon"}:
            return 0
            
        # Low priority generic
        if prefix in {"admin", "support", "webmaster", "postmaster"}:
            return 1
            
        # Generic legitimate
        if prefix in {"info", "hello", "contact", "enquiries", "reception", "office", "sales"}:
            return 2
            
        # Operational
        if prefix in {"bookings", "appointments", "studio", "salon", "booking", "appointment"}:
            return 3
            
        # Named email (assumed default if not in other lists)
        return 4

    @staticmethod
    def _check_industry_match(
        industry: str,
        business_name: Optional[str],
        services: Optional[str],
        website: Optional[str],
    ) -> bool:
        """Check if the lead matches the target industry (lenient match)."""
        if not industry:
            return True

        ind_lower = industry.lower()
        words = ind_lower.split()

        if business_name and any(w in business_name.lower() for w in words):
            return True
        if services and any(w in services.lower() for w in words):
            return True
        if website and any(w in website.lower() for w in words):
            return True

        return True  # Lenient default

    @staticmethod
    def _check_location_match(
        target_location: str,
        suburb: Optional[str],
        address: Optional[str],
        website: Optional[str],
    ) -> bool:
        """Check if the lead matches target location."""
        if not target_location:
            return True

        target_lower = target_location.lower()
        ignore = {"in", "at", "near", "around", "from", "australia", "nsw", "vic", "qld", "wa", "sa", "tas", "act", "nt"}
        target_words = [w for w in re.split(r"\W+", target_lower) if w and w not in ignore]

        if not target_words:
            return True

        if suburb and any(w in suburb.lower() for w in target_words):
            return True
        if address and any(w in address.lower() for w in target_words):
            return True
        if website and any(w in website.lower() for w in target_words):
            return True

        return True  # Lenient default

# Singleton
lead_quality_gate = LeadQualityGate()
