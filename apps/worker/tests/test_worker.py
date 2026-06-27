import hashlib
import hmac
import json
import os
import unittest
from unittest.mock import Mock, patch
import requests

os.environ.setdefault("WEBHOOK_SECRET", "unit-test-webhook-secret")
os.environ.setdefault("MOCK_MODE", "true")

from src.agents.command_understanding_agent import CommandUnderstandingAgent
from src.workflows import command_workflow


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.agent = CommandUnderstandingAgent()

    def test_outreach_allowed_and_quantity_preserved(self):
        plan = self.agent.understand("Find 5 salons in Sydney and draft emails")
        self.assertTrue(plan["allowed"])
        self.assertEqual(plan["intent"], "scrape_leads")
        self.assertEqual(plan["quantity"], 5)
        self.assertTrue(plan["intent_flags"]["drafting_requested"])

    def test_outreach_get_mail_allowed(self):
        plan = self.agent.understand("get mail from sydney campise salon owners 50 emials and bussines name")
        self.assertTrue(plan["allowed"])
        self.assertEqual(plan["intent"], "scrape_leads")
        self.assertEqual(plan["quantity"], 10)  # capped by config.MAX_SITES_PER_JOB (10 in unit test environment or config)

    def test_unrelated_prompt_blocked(self):
        plan = self.agent.understand("Write me a recipe")
        self.assertFalse(plan["allowed"])
        self.assertEqual(plan["intent"], "out_of_scope")


class WebhookTests(unittest.TestCase):
    @patch("src.workflows.command_workflow.time.time", return_value=1_700_000_000)
    @patch("src.workflows.command_workflow.requests.post")
    def test_signature_covers_timestamp_and_exact_body(self, post, _time):
        response = Mock()
        response.raise_for_status.return_value = None
        post.return_value = response
        command_workflow._notify_webhook("heartbeat", {"job_id": "job-1"})
        kwargs = post.call_args.kwargs
        raw = kwargs["data"]
        timestamp = kwargs["headers"]["X-Webhook-Timestamp"]
        expected = hmac.new(command_workflow.config.WEBHOOK_SECRET.encode(), timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
        self.assertEqual(kwargs["headers"]["X-Webhook-Signature"], expected)
        self.assertEqual(json.loads(raw), {"type": "heartbeat", "data": {"job_id": "job-1"}})

    @patch("src.workflows.command_workflow.requests.get")
    def test_cancellation_reads_nested_job_status(self, get):
        get.return_value.ok = True
        get.return_value.json.return_value = {"job": {"status": "cancellation_requested"}}
        self.assertTrue(command_workflow.is_job_cancelled("job-1", "workspace-1"))

    @patch("src.workflows.command_workflow.time.sleep")
    @patch("src.workflows.command_workflow.requests.post")
    def test_webhook_retry_resilience(self, post_mock, sleep_mock):
        fail_response = Mock()
        fail_response.raise_for_status.side_effect = requests.RequestException("Transient error")
        success_response = Mock()
        success_response.raise_for_status.return_value = None
        
        post_mock.side_effect = [fail_response, fail_response, success_response]
        
        command_workflow._notify_webhook("test_event", {"data": "ok"})
        
        self.assertEqual(post_mock.call_count, 3)
        self.assertEqual(sleep_mock.call_count, 2)
        # Verify the delays were 1s and 2s
        self.assertEqual(sleep_mock.call_args_list[0][0][0], 1)
        self.assertEqual(sleep_mock.call_args_list[1][0][0], 2)

    @patch("src.workflows.command_workflow.time.sleep")
    @patch("src.workflows.command_workflow.requests.post")
    def test_webhook_max_retries_failure_does_not_crash(self, post_mock, sleep_mock):
        fail_response = Mock()
        fail_response.raise_for_status.side_effect = requests.RequestException("Permanent error")
        post_mock.return_value = fail_response
        
        try:
            command_workflow._notify_webhook("test_event", {"data": "fail"})
        except Exception as e:
            self.fail(f"_notify_webhook raised an exception on failure: {e}")
            
        self.assertEqual(post_mock.call_count, 4)
        self.assertEqual(sleep_mock.call_count, 3)


class CampaignDraftingTests(unittest.TestCase):
    def setUp(self):
        self.agent = CommandUnderstandingAgent()

    def test_json_draft_emails_understanding(self):
        prompt = json.dumps({
            "intent": "draft_emails",
            "campaign_id": "test-camp-123"
        })
        plan = self.agent.understand(prompt)
        self.assertTrue(plan["allowed"])
        self.assertEqual(plan["intent"], "draft_emails")
        self.assertEqual(plan["campaign_id"], "test-camp-123")

    @patch("src.workflows.command_workflow._notify_webhook")
    @patch("src.workflows.command_workflow.requests.get")
    def test_draft_campaign_leads_workflow(self, mock_get, mock_notify):
        # Mock the campaign response from Next.js API
        mock_campaign_response = Mock()
        mock_campaign_response.json.return_value = {
            "id": "test-camp-123",
            "name": "Test Sales Campaign",
            "drafts": [],  # no existing drafts
            "campaignLeads": [
                {
                    "lead": {
                        "id": "lead-1",
                        "email": "test-lead@example.com",
                        "businessName": "Test Business",
                        "status": "new"
                    }
                }
            ]
        }
        mock_get.return_value = mock_campaign_response
        
        # Call the workflow
        command_workflow.run_command_workflow(
            workspace_id="test-ws-1",
            command_id=None,
            prompt=json.dumps({"intent": "draft_emails", "campaign_id": "test-camp-123"}),
            job_id="job-draft-1"
        )
        
        # Verify it fetched the campaign
        campaign_get_calls = [
            call for call in mock_get.call_args_list 
            if "api/campaigns/test-camp-123" in call[0][0]
        ]
        self.assertEqual(len(campaign_get_calls), 1)
        
        # Verify the webhook events emitted: lead_enriched, draft_created, job_completed, etc.
        emitted_types = [call[0][0] for call in mock_notify.call_args_list]
        self.assertIn("lead_enriched", emitted_types)
        self.assertIn("draft_created", emitted_types)
        self.assertIn("job_completed", emitted_types)
        
        # Find the draft_created event and check it contains campaign_id
        draft_created_event = next(call[0][1] for call in mock_notify.call_args_list if call[0][0] == "draft_created")
        self.assertEqual(draft_created_event["campaign_id"], "test-camp-123")
        self.assertEqual(draft_created_event["lead_id"], "lead-1")


class LeadDiscoveryWorkflowTests(unittest.TestCase):
    @patch("src.workflows.command_workflow.is_job_cancelled", return_value=False)
    @patch("src.workflows.command_workflow._notify_webhook")
    @patch("src.workflows.command_workflow.LeadDiscoveryPipeline")
    @patch("src.workflows.command_workflow.CommandUnderstandingAgent")
    def test_country_does_not_replace_location_for_live_pipeline(self, agent_cls, pipeline_cls, _notify, _cancelled):
        agent_cls.return_value.understand.return_value = {
            "allowed": True,
            "intent": "scrape_leads",
            "goal": "Find salons in Sydney",
            "parameters": {
                "industry": "salons",
                "location": "Sydney",
                "country": "AU",
                "quantity": 3,
            },
            "intent_flags": {},
        }

        with patch.object(command_workflow.config, "MOCK_MODE", False):
            command_workflow.run_command_workflow(
                workspace_id="test-ws-1",
                command_id="cmd-1",
                prompt="Find 3 salons in Sydney",
                job_id="job-live-1",
            )

        pipeline_cls.return_value.run.assert_called_once_with(
            industry="salons",
            location="Sydney",
            quantity=3,
            country="AU",
        )


if __name__ == "__main__":
    unittest.main()
