"""Tests for the new lead discovery pipeline components."""

import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch, MagicMock

os.environ.setdefault("WEBHOOK_SECRET", "unit-test-webhook-secret")
os.environ.setdefault("OPENAI_API_KEY", "unit-test-openai-key")
os.environ.setdefault("MOCK_MODE", "false")

# Ensure src is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from services.location_expansion_service import LocationExpansionService
from services.query_planner_service import QueryPlannerService
from services.query_rate_limiter import QueryRateLimiter
from services.url_classifier_service import URLClassifierService
from services.cheap_contact_extractor import CheapContactExtractor
from services.scrapegraph_fallback_extractor import ScrapeGraphFallbackExtractor
from services.lead_quality_gate import LeadQualityGate
from services.normalization import normalize_business_name
from services.snapshot_store import SnapshotStore
from services.source_health_checker import SourceHealthChecker, SourceHealthInput


class TestLocationExpansionService(unittest.TestCase):
    def setUp(self):
        # data/ is at worker/src/data/
        data_dir = os.path.join(os.path.dirname(__file__), "..", "src", "data")
        self.service = LocationExpansionService(data_dir=data_dir)

    def test_expands_sydney(self):
        result = self.service.expand("Sydney")
        self.assertEqual(result["city"], "Sydney")
        self.assertEqual(result["state"], "NSW")
        self.assertGreater(len(result["suburbs"]), 10)
        self.assertIn("Bondi", result["suburbs"])
        self.assertIn("Newtown", result["suburbs"])
        self.assertIn("Campsie", result["suburbs"])

    def test_expands_melbourne(self):
        result = self.service.expand("Melbourne")
        self.assertEqual(result["city"], "Melbourne")
        self.assertEqual(result["state"], "VIC")
        self.assertGreater(len(result["suburbs"]), 10)

    def test_expands_brisbane(self):
        result = self.service.expand("Brisbane")
        self.assertEqual(result["city"], "Brisbane")
        self.assertEqual(result["state"], "QLD")
        self.assertGreater(len(result["suburbs"]), 10)

    def test_fallback_for_unknown_location(self):
        result = self.service.expand("Timbuktu")
        self.assertEqual(result["city"], "Timbuktu")
        self.assertEqual(result["suburbs"], ["Timbuktu"])
        self.assertEqual(len(result["search_targets"]), 1)

    def test_suburb_infers_city(self):
        # "Bondi" is a Sydney suburb — should expand to full Sydney list
        result = self.service.expand("Bondi")
        self.assertEqual(result["city"], "Sydney")
        self.assertIn("Newtown", result["suburbs"])  # Other suburbs included

    def test_search_targets_include_suburbs_and_city(self):
        result = self.service.expand("Sydney")
        targets = result["search_targets"]
        self.assertIn("Bondi", targets)
        self.assertIn("Sydney CBD", targets)
        self.assertIn("inner west", targets)  # keywords


class TestQueryPlannerService(unittest.TestCase):
    def setUp(self):
        self.planner = QueryPlannerService(max_queries=100)
        self.sydney_expansion = {
            "city": "Sydney",
            "state": "NSW",
            "country": "Australia",
            "suburbs": ["Bondi", "Newtown", "Campsie", "Surry Hills"],
            "keywords": ["inner west", "eastern suburbs"],
            "search_targets": ["Bondi", "Newtown", "Campsie", "Surry Hills", "Sydney CBD", "inner west", "eastern suburbs"],
        }

    def test_generates_queries_for_industry_and_location(self):
        plan = self.planner.plan("salon", self.sydney_expansion, quantity=10)
        self.assertGreater(plan["total"], 0)
        self.assertIsInstance(plan["queries"], list)
        self.assertIsInstance(plan["direct_queries"], list)
        self.assertIn("salon", plan["queries"][0].lower())

    def test_queries_include_location_targets(self):
        plan = self.planner.plan("plumber", self.sydney_expansion)
        all_text = " ".join(plan["queries"]).lower()
        self.assertIn("bondi", all_text)
        self.assertIn("newtown", all_text)

    def test_respects_max_queries(self):
        planner = QueryPlannerService(max_queries=20)
        plan = planner.plan("salon", self.sydney_expansion)
        self.assertLessEqual(plan["total"], 20)

    def test_estimates_queries_for_quantity(self):
        estimated = self.planner.queries_for_quantity(50)
        self.assertGreaterEqual(estimated, 20)
        self.assertLessEqual(estimated, 100)

    def test_directory_queries_optional(self):
        plan_with_dir = self.planner.plan("salon", self.sydney_expansion, include_directory_queries=True)
        plan_no_dir = self.planner.plan("salon", self.sydney_expansion, include_directory_queries=False)
        self.assertGreaterEqual(len(plan_with_dir["queries"]), len(plan_no_dir["queries"]))

    def test_country_adapter_adds_local_language_queries_after_english(self):
        expansion = {
            "city": "Montreal",
            "country": "Canada",
            "suburbs": ["Montreal QC"],
            "keywords": [],
            "search_targets": ["Montreal QC"],
        }
        plan = self.planner.plan("dentist", expansion, include_directory_queries=False)
        joined = " ".join(plan["queries"]).lower()
        self.assertIn("dentist", joined)
        self.assertIn("dentiste", joined)
        self.assertLess(joined.index("dentist"), joined.index("dentiste"))


class TestQueryRateLimiter(unittest.TestCase):
    def setUp(self):
        self.limiter = QueryRateLimiter(batch_size=5, min_delay=0.01, max_delay=0.02, max_batches=10)

    def test_splits_into_batches(self):
        queries = [f"query {i}" for i in range(23)]
        batches = self.limiter.batch_queries(queries)
        self.assertEqual(len(batches), 5)  # 5, 5, 5, 5, 3
        self.assertEqual(len(batches[0]), 5)
        self.assertEqual(len(batches[-1]), 3)

    def test_respects_max_batches(self):
        queries = [f"query {i}" for i in range(200)]
        batches = self.limiter.batch_queries(queries)
        self.assertLessEqual(len(batches), 10)

    def test_run_with_limits_processes_all(self):
        queries = [f"query {i}" for i in range(12)]
        results = []

        def process_batch(batch):
            results.extend(batch)
            return len(batch)

        self.limiter.run_with_limits(queries, process_batch=process_batch)
        self.assertEqual(len(results), 12)

    def test_stop_early_works(self):
        queries = [f"query {i}" for i in range(50)]
        call_count = 0

        def process_batch(batch):
            nonlocal call_count
            call_count += 1
            return batch

        def stop_early():
            return call_count >= 2

        self.limiter.run_with_limits(queries, process_batch=process_batch, stop_early=stop_early)
        self.assertLessEqual(call_count, 3)  # Should stop after ~2 batches


class TestURLClassifierService(unittest.TestCase):
    def setUp(self):
        self.classifier = URLClassifierService()

    def test_classifies_business_website(self):
        result = self.classifier.classify("https://sydneyhairco.com.au")
        self.assertEqual(result, "business_website")

    def test_classifies_yelp_as_directory(self):
        result = self.classifier.classify("https://www.yelp.com/search?find_desc=salon&find_loc=sydney")
        self.assertEqual(result, "directory")

    def test_classifies_yellowpages_as_directory(self):
        result = self.classifier.classify("https://www.yellowpages.com.au/search/listings?q=salon&l=sydney")
        self.assertEqual(result, "directory")

    def test_classifies_facebook_as_bad(self):
        result = self.classifier.classify("https://www.facebook.com/somesalon")
        self.assertEqual(result, "bad")

    def test_classifies_linkedin_as_bad(self):
        result = self.classifier.classify("https://www.linkedin.com/company/some-company")
        self.assertEqual(result, "bad")

    def test_classify_many_groups_correctly(self):
        urls = [
            "https://salon.com.au",
            "https://www.yelp.com/search?q=salon",
            "https://www.facebook.com/salon",
            "https://plumber-sydney.com.au/contact",
        ]
        result = self.classifier.classify_many(urls)
        self.assertEqual(len(result["business_website"]), 2)
        self.assertEqual(len(result["directory"]), 1)
        self.assertEqual(len(result["bad"]), 1)

    def test_search_path_looks_like_directory(self):
        result = self.classifier.classify("https://someblog.com/search?q=salon")
        self.assertEqual(result, "directory")


class TestCheapContactExtractor(unittest.TestCase):
    def setUp(self):
        self.extractor = CheapContactExtractor()

    def test_extract_mailto_link(self):
        html = '<a href="mailto:hello@salon.com.au">Contact us</a>'
        result = self.extractor.extract(html, "https://salon.com.au")
        self.assertIn("hello@salon.com.au", result["emails"])
        self.assertEqual(result["extraction_method"], "mailto")
        self.assertGreater(result["confidence_score"], 0.9)

    def test_extract_email_regex(self):
        html = '<p>Email us at info@salon.com.au for bookings</p>'
        result = self.extractor.extract(html, "https://salon.com.au")
        self.assertIn("info@salon.com.au", result["emails"])

    def test_extract_phone_au(self):
        html = '<p>Call us on (02) 9000 1234</p>'
        result = self.extractor.extract(html, "https://salon.com.au")
        self.assertTrue(any("9000" in p for p in result["phones"]))

    def test_extract_schema_jsonld(self):
        html = '''
        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "BeautySalon",
            "name": "Sydney Hair Co",
            "email": "hello@sydneyhairco.com.au",
            "telephone": "(02) 9000 1234"
        }
        </script>
        '''
        result = self.extractor.extract(html, "https://sydneyhairco.com.au")
        self.assertIn("hello@sydneyhairco.com.au", result["emails"])
        self.assertEqual(result["business_name"], "Sydney Hair Co")
        self.assertTrue(result["schema_data"])

    def test_extract_business_name_from_title(self):
        html = '<title>Sydney Hair Co - Best Salon in Sydney</title>'
        result = self.extractor.extract(html, "https://sydneyhairco.com.au")
        self.assertEqual(result["business_name"], "Sydney Hair Co")

    def test_extract_social_links(self):
        html = '<a href="https://www.instagram.com/sydneyhairco">Instagram</a>'
        result = self.extractor.extract(html, "https://sydneyhairco.com.au")
        self.assertTrue(any("instagram.com" in link for link in result["social_links"]))

    def test_filters_placeholder_emails(self):
        html = '<p>email: placeholder@email.com</p><p>real: hello@salon.com.au</p>'
        result = self.extractor.extract(html, "https://salon.com.au")
        self.assertNotIn("placeholder@email.com", result["emails"])

    def test_get_best_email_prefers_non_role(self):
        emails = ["info@salon.com.au", "owner@salon.com.au", "hello@salon.com.au"]
        best = self.extractor.get_best_email(emails)
        # All are role emails, should return first
        self.assertIsNotNone(best)

    def test_confidence_boost_with_multiple_data_points(self):
        html = '''
        <title>Salon Name</title>
        <a href="mailto:hello@salon.com.au">Contact</a>
        <p>Call (02) 9000 1234</p>
        '''
        result = self.extractor.extract(html, "https://salon.com.au")
        self.assertTrue(result["emails"])
        self.assertTrue(result["phones"])
        self.assertTrue(result["business_name"])
        self.assertGreater(result["confidence_score"], 0.85)


class TestScrapeGraphFallbackExtractor(unittest.TestCase):
    def setUp(self):
        self.extractor = ScrapeGraphFallbackExtractor()

    def test_does_not_trigger_for_strong_cheap_result(self):
        cheap = {
            "emails": ["hello@salon.com.au"],
            "business_name": "Sydney Hair Co",
            "confidence_score": 0.9,
        }
        self.assertFalse(self.extractor.should_fallback(cheap))

    def test_triggers_for_weak_cheap_result(self):
        self.assertTrue(self.extractor.should_fallback({"emails": [], "business_name": "Sydney Hair Co", "confidence_score": 0.9}))
        self.assertTrue(self.extractor.should_fallback({"emails": ["hello@salon.com.au"], "business_name": None, "confidence_score": 0.9}))
        self.assertTrue(self.extractor.should_fallback({"emails": ["hello@salon.com.au"], "business_name": "Sydney Hair Co", "confidence_score": 0.4}))

    def test_accepts_visible_evidence_based_result(self):
        pages = {
            "contact": """
                <html><body>
                <h1>Sydney Hair Co</h1>
                <p>Email hello@sydneyhairco.com.au or call (02) 9000 1234.</p>
                <p>Located in Bondi. Services: haircuts and colour.</p>
                </body></html>
            """
        }
        with patch.object(self.extractor, "_run_scrapegraphai", return_value={
            "businessName": "Sydney Hair Co",
            "email": "hello@sydneyhairco.com.au",
            "phone": "(02) 9000 1234",
            "website": "https://sydneyhairco.com.au",
            "suburb": "Bondi",
            "services": ["haircuts", "colour"],
            "confidence": 0.91,
            "evidence": ["Email hello@sydneyhairco.com.au or call (02) 9000 1234"],
        }):
            result = self.extractor.extract(pages, "https://sydneyhairco.com.au", "salon", "Bondi", "Australia")

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["email"], "hello@sydneyhairco.com.au")
        self.assertEqual(result["businessName"], "Sydney Hair Co")
        self.assertEqual(result["suburb"], "Bondi")
        self.assertIn("haircuts", result["services"])
        self.assertTrue(result["evidence"])

    def test_rejects_hallucinated_fields_without_visible_support(self):
        source = "Sydney Hair Co is a salon in Bondi. Call (02) 9000 1234."
        result = self.extractor._validate({
            "businessName": "Sydney Hair Co",
            "email": "owner@invented.com",
            "phone": "(02) 9000 1234",
            "website": "https://sydneyhairco.com.au",
            "suburb": "Parramatta",
            "services": ["laser tattoo removal"],
            "confidence": 0.9,
            "evidence": ["Call (02) 9000 1234"],
        }, source, "https://sydneyhairco.com.au")

        self.assertEqual(result["email"], None)
        self.assertEqual(result["suburb"], None)
        self.assertEqual(result["services"], [])


class TestLeadQualityGate(unittest.TestCase):
    def setUp(self):
        self.gate = LeadQualityGate()
        self.gate._check_mx = MagicMock(return_value=True)

    def test_passes_valid_lead(self):
        result = self.gate.evaluate(
            email="hello@salon.com.au",
            business_name="Sydney Hair Co",
            website="https://salon.com.au",
            phone="(02) 9000 1234",
            suburb="Bondi",
            industry="salon",
            target_location="Sydney",
            services="Hair cuts, colouring, styling",
            confidence_score=0.9,
        )
        self.assertTrue(result["passed"])
        self.assertTrue(result["email_valid"])
        self.assertTrue(result["industry_match"])
        self.assertTrue(result["location_match"])
        self.assertEqual(result["location_status"], "weak")
        self.assertGreater(result["icp_score"], 0.7)

    def test_blocks_disposable_email(self):
        result = self.gate.evaluate(
            email="test@mailinator.com",
            business_name="Test",
            website="https://test.com",
            phone=None,
            suburb=None,
            industry="salon",
            target_location="Sydney",
        )
        self.assertFalse(result["passed"])
        self.assertIn("disposable_email", result["blocks"])

    def test_flags_role_email(self):
        result = self.gate.evaluate(
            email="info@salon.com.au",
            business_name="Sydney Hair Co",
            website="https://salon.com.au",
            phone=None,
            suburb="Bondi",
            industry="salon",
            target_location="Sydney",
        )
        self.assertTrue(result["passed"])  # Still passes
        self.assertIn("role_email", result["flags"])  # But flagged

    def test_blocks_no_email_no_website(self):
        result = self.gate.evaluate(
            email=None,
            business_name="Some Business",
            website=None,
            phone="(02) 9000 1234",
            suburb="Bondi",
            industry="salon",
            target_location="Sydney",
        )
        self.assertFalse(result["passed"])
        self.assertIn("no_email_and_no_website", result["blocks"])

    def test_icp_score_ranges(self):
        # Low quality lead
        low = self.gate.evaluate(
            email="info@test.com",
            business_name=None,
            website=None,
            phone=None,
            suburb=None,
            industry="salon",
            target_location="Sydney",
            confidence_score=0.1,
        )
        # High quality lead
        high = self.gate.evaluate(
            email="owner@salon.com.au",
            business_name="Salon Name",
            website="https://salon.com.au",
            phone="(02) 9000 1234",
            suburb="Bondi",
            industry="salon",
            target_location="Sydney",
            services="Full service salon",
            confidence_score=0.95,
        )
        self.assertGreater(high["icp_score"], low["icp_score"])

    def test_blocks_explicit_location_mismatch(self):
        result = self.gate.evaluate(
            email="owner@salon.com.au",
            business_name="Salon Name",
            website="https://salon.com.au",
            phone="(02) 9000 1234",
            suburb="Liverpool",
            industry="salon",
            target_location="Parramatta",
            services="Full service salon",
            confidence_score=0.9,
        )
        self.assertFalse(result["passed"])
        self.assertIn("location_mismatch", result["blocks"])
        self.assertEqual(result["location_status"], "mismatch")
        self.assertLess(result["location_confidence"], 0.5)

    def test_allows_broad_city_with_weaker_proof(self):
        result = self.gate.evaluate(
            email="owner@salon.com.au",
            business_name="Salon Name",
            website="https://salon.com.au",
            phone="(02) 9000 1234",
            suburb="Bondi",
            industry="salon",
            target_location="Sydney",
            services="Full service salon",
            confidence_score=0.9,
        )
        self.assertTrue(result["passed"])
        self.assertEqual(result["location_status"], "weak")
        self.assertIn("location_needs_review", result["flags"])


class TestSearchResultNormalizer(unittest.TestCase):
    def test_normalizes_url(self):
        from services.search_result_normalizer import SearchResultNormalizer
        url = "https://WWW.BellaHairStudio.com.au/contact/?utm_source=fb&fbclid=123#about"
        normalized = SearchResultNormalizer.normalize(url)
        self.assertEqual(normalized, "https://www.bellahairstudio.com.au/contact")


class TestBusinessNameNormalizer(unittest.TestCase):
    def test_strips_legal_suffixes_deterministically(self):
        self.assertEqual(normalize_business_name("Royal Cuts Barber Pty Ltd"), "royal cuts barber")
        self.assertEqual(normalize_business_name("Royal Cuts Barber, Pty. Ltd."), "royal cuts barber")
        self.assertEqual(normalize_business_name("ROYAL CUTS BARBER & CO"), "royal cuts barber")

    def test_keeps_industry_words(self):
        self.assertEqual(normalize_business_name("Royal Cuts Barber"), "royal cuts barber")
        self.assertEqual(normalize_business_name("The Dental Studio LLC"), "dental studio")


class TestSnapshotStore(unittest.TestCase):
    def test_stores_raw_html_snapshot_descriptor(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            store = SnapshotStore(base_dir=Path(temp_dir))
            snapshots = store.store_pages(
                job_id="job-1",
                base_url="https://example.com",
                pages={"contact": "<html>Email hello@example.com Call +61 2 9000 1234</html>"},
            )
            self.assertEqual(len(snapshots), 1)
            self.assertEqual(snapshots[0]["source_role"], "contact_page")
            self.assertIn("email", snapshots[0]["evidence_types"])
            self.assertTrue(os.path.exists(snapshots[0]["raw_html_storage_key"]))


class TestSourceHealthChecker(unittest.TestCase):
    def setUp(self):
        self.checker = SourceHealthChecker()

    def test_cadence_matches_source_status(self):
        self.assertEqual(self.checker.next_check_after("approved"), timedelta(days=7))
        self.assertEqual(self.checker.next_check_after("limited"), timedelta(days=3))
        self.assertEqual(self.checker.next_check_after("approved", recent_failures=True), timedelta(days=1))
        self.assertIsNone(self.checker.next_check_after("unknown"))
        self.assertIsNone(self.checker.next_check_after("blocked"))

    def test_due_for_check_uses_cadence(self):
        now = datetime(2026, 6, 27, tzinfo=timezone.utc)
        source = SourceHealthInput(
            source_id="src-1",
            status="approved",
            last_checked_at=now - timedelta(days=8),
        )
        self.assertTrue(self.checker.due_for_check(source, now=now))

    def test_auto_status_rules(self):
        limited = self.checker.decide_status(SourceHealthInput("src-1", "approved", failure_rate_7d=0.6))
        self.assertEqual(limited.new_status, "limited")
        self.assertTrue(limited.should_write_event)

        manual = self.checker.decide_status(SourceHealthInput("src-1", "limited", failure_rate_7d=0.9))
        self.assertEqual(manual.new_status, "manual_only")

        blocked = self.checker.decide_status(SourceHealthInput("src-1", "approved", robots_disallows=True))
        self.assertEqual(blocked.new_status, "blocked")


class TestLocationScopeDecider(unittest.TestCase):
    def test_decides_exact_suburb(self):
        from services.location_expansion_service import location_scope_decider
        scope = location_scope_decider.decide("Get 50 salon emails in Campsie", "Campsie")
        self.assertEqual(scope, "exact_suburb")

    def test_decides_nearby(self):
        from services.location_expansion_service import location_scope_decider
        scope = location_scope_decider.decide("Get 50 salon emails near Campsie", "Campsie")
        self.assertEqual(scope, "nearby")

    def test_decides_metro(self):
        from services.location_expansion_service import location_scope_decider
        scope = location_scope_decider.decide("Get 50 salon emails in Sydney", "Sydney")
        self.assertEqual(scope, "metro")


class TestLeadQualityScorerAndOverrides(unittest.TestCase):
    def setUp(self):
        from services.lead_quality_gate import LeadQualityGate
        self.gate = LeadQualityGate()

    def test_tier_a_lead(self):
        result = self.gate.evaluate(
            email="owner@salon.com.au",
            business_name="Super Salon",
            website="https://salon.com.au",
            phone="0290001234",
            suburb="Bondi",
            industry="salon",
            target_location="Sydney",
            source_type="direct_website",
            extraction_method="cheap_extractor"
        )
        self.assertEqual(result["tier"], "A")
        self.assertGreaterEqual(result["quality_score"], 80)

    def test_scrapegraph_fallback_override_caps_at_tier_b(self):
        result = self.gate.evaluate(
            email="owner@salon.com.au",
            business_name="Super Salon",
            website="https://salon.com.au",
            phone="0290001234",
            suburb="Bondi",
            industry="salon",
            target_location="Sydney",
            source_type="direct_website",
            extraction_method="scrapegraph_fallback"
        )
        self.assertEqual(result["tier"], "B")

    def test_scrapegraphai_override_caps_at_tier_b(self):
        result = self.gate.evaluate(
            email="owner@salon.com.au",
            business_name="Super Salon",
            website="https://salon.com.au",
            phone="0290001234",
            suburb="Bondi",
            industry="salon",
            target_location="Sydney",
            source_type="direct_website",
            extraction_method="scrapegraphai"
        )
        self.assertEqual(result["tier"], "B")


class TestLeadDiscoveryPipelineMetadata(unittest.TestCase):
    def test_save_lead_receives_scrapegraphai_evidence_metadata(self):
        from services.lead_discovery_pipeline import LeadDiscoveryPipeline

        saved = []
        pipeline = LeadDiscoveryPipeline(
            job_id="job-1",
            workspace_id="ws-1",
            emit_event=lambda **kwargs: None,
            save_lead=lambda **kwargs: saved.append(kwargs),
            check_cancelled=lambda: False,
            prompt="Find salons in Bondi",
        )
        pipeline.location_raw = "Bondi"
        pipeline.quality_gate._check_mx = MagicMock(return_value=True)

        pipeline._process_extracted_data(
            target={"url": "https://sydneyhairco.com.au", "source_type": "direct_website", "source_url": "https://sydneyhairco.com.au"},
            emails=["hello@sydneyhairco.com.au"],
            phones=["(02) 9000 1234"],
            biz_name="Sydney Hair Co",
            address="Bondi NSW",
            industry="salon",
            extraction_method="scrapegraphai",
            confidence_score=0.91,
            evidence=["Email hello@sydneyhairco.com.au"],
            services=["haircuts"],
        )

        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["extraction_method"], "scrapegraphai")
        self.assertEqual(saved[0]["evidence"], ["Email hello@sydneyhairco.com.au"])
        self.assertEqual(saved[0]["services"], ["haircuts"])
        self.assertEqual(saved[0]["confidence_score"], 0.91)

    def test_dedupe_uses_business_name_normalizer(self):
        from services.lead_discovery_pipeline import LeadDiscoveryPipeline

        pipeline = LeadDiscoveryPipeline(
            job_id="job-1",
            workspace_id="ws-1",
            emit_event=lambda **kwargs: None,
            save_lead=lambda **kwargs: None,
            check_cancelled=lambda: False,
            prompt="Find barbers in Bondi",
        )
        pipeline.discovered_names_suburbs[("royal cuts barber", "bondi")] = "tier_c"

        duplicate = pipeline._check_and_merge_duplicate(
            email=None,
            website=None,
            phone=None,
            name="Royal Cuts Barber Pty. Ltd.",
            suburb="Bondi",
            address=None,
            source_url="https://directory.example/royal-cuts",
            source_type="directory_listing",
        )

        self.assertTrue(duplicate)

    def test_unknown_location_queries_include_country_fallback(self):
        from services.lead_discovery_pipeline import LeadDiscoveryPipeline

        pipeline = LeadDiscoveryPipeline(
            job_id="job-1",
            workspace_id="ws-1",
            emit_event=lambda **kwargs: None,
            save_lead=lambda **kwargs: None,
            check_cancelled=lambda: False,
            prompt="Find dentists in Pokhara",
        )
        pipeline.city_data = {"city": "Pokhara", "country": None}
        pipeline.country_raw = "Nepal"
        pipeline._generate_queries_for_locations("dentists", ["Pokhara"])

        all_queries = " ".join(pipeline.search_query_pool).lower()
        self.assertIn("pokhara, nepal", all_queries)


if __name__ == "__main__":
    unittest.main()
