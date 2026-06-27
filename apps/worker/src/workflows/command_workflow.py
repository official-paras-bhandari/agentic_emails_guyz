import hashlib
import hmac
import json
import os
import time
from typing import Any

import requests

from src.config import config


def _backend_headers() -> dict[str, str]:
    return {"X-Internal-Api-Key": config.INTERNAL_API_KEY} if config.INTERNAL_API_KEY else {}


def is_job_cancelled(job_id: str, workspace_id: str) -> bool:
    base_url = config.WEBHOOK_URL.split('/api/webhooks/worker')[0]
    try:
        response = requests.get(f"{base_url}/api/jobs/{job_id}", params={"workspaceId": workspace_id}, headers=_backend_headers(), timeout=5)
        if response.ok:
            return response.json().get("job", {}).get("status") in {"cancellation_requested", "cancelled"}
    except requests.RequestException as error:
        print(f"Cancellation check failed: {error}")
    return False


def run_command_workflow(
    workspace_id: str,
    command_id: str | None,
    prompt: str,
    job_id: str,
    mock_mode: bool | None = None,
    plan: dict | None = None,
    workspace_profile: dict | None = None,
    user_profile: dict | None = None
):
    if not all([workspace_id, prompt, job_id]):
        raise ValueError("workspace_id, prompt and job_id are required")
    worker_id = f"worker-{os.getpid()}"

    def notify(event_type: str, data: dict):
        if workspace_id and "workspace_id" not in data:
            data["workspace_id"] = workspace_id
        _notify_webhook(event_type, data)

    try:
        notify("job_started", {
            "job_id": job_id, "workspace_id": workspace_id, "command_id": command_id,
            "worker_id": worker_id, "message": "Worker picked up the job",
        })
        if is_job_cancelled(job_id, workspace_id):
            notify("job_cancelled", {"job_id": job_id})
            return

        # --- Internal intent fast path ---
        # FollowUpService embeds parameters as __params__:<json> in the prompt.
        # Skip CommandUnderstandingAgent for known internal intents.
        import re as _re
        internal_params: dict[str, Any] = {}
        internal_intent: str | None = None
        params_match = _re.search(r"__params__:(\{.+\})", prompt)
        if params_match:
            try:
                internal_params = json.loads(params_match.group(1))
            except Exception:
                pass

        if prompt.startswith("draft_followup"):
            internal_intent = "draft_followup"
        elif prompt.startswith("draft_emails"):
            internal_intent = "draft_emails"

        if plan:
            # We already have the planned parameters from Next.js planning step!
            intent = plan.get("intent") or plan.get("command_type")
            parameters = plan.get("parameters") or plan
        elif internal_intent:
            intent = internal_intent
            parameters = internal_params
            plan = {"allowed": True, "intent": intent}
        else:
            # --- Normal user-driven command path ---
            notify("step_running", {"job_id": job_id, "step": "understanding", "message": "Analyzing request"})
            from src.agents.command_understanding_agent import CommandUnderstandingAgent
            plan = CommandUnderstandingAgent().understand(prompt, user_profile, workspace_profile)
            if not plan.get("allowed", False):
                raise ValueError("Command was rejected by the outreach domain guard")

            intent = plan.get("intent") or plan.get("command_type")
            if intent not in {"scrape_leads", "find_businesses", "analyze_business", "export_leads", "draft_emails", "draft_followup"}:
                raise ValueError(f"Command type '{intent}' is not implemented by the worker")
            parameters = plan.get("parameters") or plan

        if is_job_cancelled(job_id, workspace_id):
            notify("job_cancelled", {"job_id": job_id})
            return

        if intent == "export_leads":
            notify("export_requested", {
                "job_id": job_id,
                "workspace_id": workspace_id,
                "message": "Export to Google Sheets requested"
            })
            notify("job_completed", {"job_id": job_id, "message": "Export job finished"})
            return

        if intent == "analyze_business":
            from src.services.business_analyzer import BusinessAnalyzer
            analyzer = BusinessAnalyzer(
                job_id=job_id,
                emit_event_fn=lambda event_type, data: notify(event_type, {"job_id": job_id, "workspace_id": workspace_id, **data})
            )
            campaign_id = parameters.get("campaign_id") or plan.get("campaign_id")
            website_url = parameters.get("businessWebsite") or plan.get("businessWebsite")
            if not campaign_id or not website_url:
                raise ValueError("campaign_id and businessWebsite are required for business analysis")
            analyzer.analyze(campaign_id, website_url)
            notify("job_completed", {"job_id": job_id, "message": "Workflow completed"})
            return

        if intent == "draft_followup":
            campaign_id = parameters.get("campaign_id")
            lead_id = parameters.get("lead_id")
            step_number = int(parameters.get("step_number", 1))
            followup_task_id = parameters.get("followup_task_id")
            past_emails = parameters.get("past_emails", [])
            if not campaign_id or not lead_id:
                raise ValueError("campaign_id and lead_id are required for draft_followup")
            _process_followup_task(workspace_id, campaign_id, lead_id, step_number, followup_task_id, past_emails, job_id)
            notify("job_completed", {"job_id": job_id, "message": f"Follow-up step {step_number} drafted"})
            return

        if intent == "draft_emails":
            import re
            campaign_id = parameters.get("campaign_id") or plan.get("campaign_id")
            if not campaign_id:
                # Regex fallback to find campaignId
                match = re.search(r"campaignId:\s*([a-zA-Z0-9_-]+)", prompt, re.IGNORECASE)
                if match:
                    campaign_id = match.group(1)
            if not campaign_id:
                raise ValueError("campaign_id is required for email drafting")
            _draft_campaign_leads(workspace_id, campaign_id, job_id)
            notify("job_completed", {"job_id": job_id, "message": "Drafting job completed"})
            return

        industry = parameters.get("industry") or "businesses"
        location = parameters.get("location") or parameters.get("city") or parameters.get("region") or "Sydney"
        country = parameters.get("country")
        requested = int(parameters.get("quantity") or 5)
        quantity = max(1, min(requested, config.MAX_SITES_PER_JOB))
        query_location = f"{location}, {country}" if country and str(country).lower() not in str(location).lower() else location
        query = f"{industry} in {query_location}"
        notify("step_running", {"job_id": job_id, "step": "searching", "message": f"Starting lead discovery for {query}"})

        use_mock = config.MOCK_MODE if mock_mode is None else mock_mode
        if use_mock:
            # Keep old mock behaviour for testing
            from src.agents.scrapegraph_agent import ScrapeGraphAgent
            ScrapeGraphAgent(mock_mode=True).run_integrated_scrape(
                job_id, plan.get("goal", prompt), query, quantity, workspace_id,
            )
        else:
            # New regex-first pipeline
            from src.services.lead_discovery_pipeline import LeadDiscoveryPipeline
            pipeline = LeadDiscoveryPipeline(
                job_id=job_id,
                workspace_id=workspace_id,
                emit_event=lambda **kw: _emit_pipeline_event(**{"job_id": job_id, **kw}),
                save_lead=lambda **kw: _save_pipeline_lead(job_id, workspace_id, **kw),
                check_cancelled=lambda: is_job_cancelled(job_id, workspace_id),
                prompt=prompt,
            )
            pipeline.run(industry=industry, location=location, quantity=quantity, country=country)

        flags = plan.get("intent_flags") or {}
        if flags.get("drafting_requested") or "draft" in prompt.lower():
            _draft_job_leads(workspace_id, job_id)

        if is_job_cancelled(job_id, workspace_id):
            notify("job_cancelled", {"job_id": job_id})
            return
        notify("job_completed", {"job_id": job_id, "message": "Workflow completed"})
    except Exception as error:
        try:
            _notify_webhook("job_failed", {
                "job_id": job_id, "message": str(error), "error_type": type(error).__name__,
            })
        except Exception as webhook_error:
            print(f"Unable to report job failure: {webhook_error}")
        raise


def _draft_job_leads(workspace_id: str, job_id: str):
    base_url = config.WEBHOOK_URL.split('/api/webhooks/worker')[0]
    response = requests.get(f"{base_url}/api/jobs/{job_id}", params={"workspaceId": workspace_id}, headers=_backend_headers(), timeout=15)
    response.raise_for_status()
    leads = response.json().get("leads", [])
    from src.agents.email_writer_agent import EmailWriterAgent
    writer = EmailWriterAgent()
    from src.agents.lead_enrichment_agent import LeadEnrichmentAgent
    enrichment_agent = LeadEnrichmentAgent()
    
    for lead in leads:
        if not lead.get("email") or lead.get("status") == "duplicate":
            continue
        try:
            enrichment = enrichment_agent.enrich(workspace_id, lead)
            _notify_webhook("lead_enriched", {
                "job_id": job_id,
                "workspace_id": workspace_id,
                "lead_id": lead["id"],
                "summary": enrichment.get("summary"),
                "personalization": enrichment.get("personalization"),
                "quality_score": enrichment.get("quality_score"),
                "data": enrichment
            })
            lead["enrichment"] = enrichment
            
            result = writer.write_draft(workspace_id, lead["id"], None, lead)
            _notify_webhook("draft_created", {
                "job_id": job_id,
                "workspace_id": workspace_id,
                "lead_id": lead["id"],
                "subject": result.get("subject", f"Question for {lead.get('businessName') or 'your team'}"),
                "body": result.get("body", "Hi, I noticed your business and wanted to reach out."),
                "verification_score": result.get("quality_score", 0.0),
                "verification_reasons": result.get("reasons", ["Manual review required"]),
            })
        except Exception as lead_err:
            print(f"Error processing lead {lead.get('id')}: {lead_err}")
            try:
                _notify_webhook("agent_event", {
                    "job_id": job_id,
                    "step": "drafting",
                    "status": "warning",
                    "message": f"Failed to generate draft for lead {lead.get('businessName') or lead.get('id')}: {lead_err}"
                })
            except Exception:
                pass


def _draft_campaign_leads(workspace_id: str, campaign_id: str, job_id: str):
    base_url = config.WEBHOOK_URL.split('/api/webhooks/worker')[0]
    response = requests.get(f"{base_url}/api/campaigns/{campaign_id}", params={"workspaceId": workspace_id}, headers=_backend_headers(), timeout=15)
    response.raise_for_status()
    campaign = response.json()
    
    # Existing drafts in this campaign
    drafts = campaign.get("drafts", [])
    existing_draft_lead_ids = {d["leadId"] for d in drafts if d.get("leadId")}
    
    # Active leads in this campaign
    campaign_leads = campaign.get("campaignLeads", [])
    
    from src.agents.email_writer_agent import EmailWriterAgent
    writer = EmailWriterAgent()
    from src.agents.lead_enrichment_agent import LeadEnrichmentAgent
    enrichment_agent = LeadEnrichmentAgent()
    
    for cl in campaign_leads:
        lead = cl.get("lead")
        if not lead or not lead.get("email"):
            continue
            
        lead_id = lead["id"]
        if lead_id in existing_draft_lead_ids:
            continue
            
        # Also skip if lead status is duplicate
        if lead.get("status") == "duplicate":
            continue
            
        try:
            # Notify steps or agent progress
            _notify_webhook("agent_event", {
                "job_id": job_id,
                "step": "drafting",
                "status": "info",
                "message": f"Enriching and drafting email for {lead.get('businessName') or lead.get('email')}"
            })
            
            enrichment = enrichment_agent.enrich(workspace_id, lead)
            _notify_webhook("lead_enriched", {
                "job_id": job_id,
                "workspace_id": workspace_id,
                "lead_id": lead_id,
                "summary": enrichment.get("summary"),
                "personalization": enrichment.get("personalization"),
                "quality_score": enrichment.get("quality_score"),
                "data": enrichment
            })
            lead["enrichment"] = enrichment
            
            result = writer.write_draft(workspace_id, lead_id, campaign_id, lead)
            _notify_webhook("draft_created", {
                "job_id": job_id,
                "workspace_id": workspace_id,
                "lead_id": lead_id,
                "campaign_id": campaign_id,
                "subject": result.get("subject", f"Question for {lead.get('businessName') or 'your team'}"),
                "body": result.get("body", "Hi, I noticed your business and wanted to reach out."),
                "verification_score": result.get("quality_score", 0.0),
                "verification_reasons": result.get("reasons", ["Manual review required"]),
            })
        except Exception as lead_err:
            print(f"Error processing campaign lead {lead_id}: {lead_err}")
            try:
                _notify_webhook("agent_event", {
                    "job_id": job_id,
                    "step": "drafting",
                    "status": "warning",
                    "message": f"Failed to generate draft for lead {lead.get('businessName') or lead_id}: {lead_err}"
                })
            except Exception:
                pass



def _process_followup_task(workspace_id: str, campaign_id: str, lead_id: str, step_number: int, followup_task_id: str | None, past_emails: list, job_id: str):
    """Calls FollowUpAgent to write a contextual follow-up email, then fires draft_created webhook."""
    base_url = config.WEBHOOK_URL.split('/api/webhooks/worker')[0]
    
    # Fetch lead context from backend
    lead_context = {}
    try:
        response = requests.get(
            f"{base_url}/api/leads/{lead_id}",
            params={"workspaceId": workspace_id},
            headers=_backend_headers(),
            timeout=15,
        )
        if response.ok:
            lead_context = response.json()
    except Exception as e:
        print(f"[FollowUpTask] Could not fetch lead context for {lead_id}: {e}")

    _notify_webhook("agent_event", {
        "job_id": job_id,
        "step": "followup",
        "status": "info",
        "message": f"Writing follow-up step {step_number} for lead {lead_context.get('businessName') or lead_id}",
    })

    from src.agents.followup_agent import FollowUpAgent
    agent = FollowUpAgent()
    result = agent.write_followup(
        workspace_id=workspace_id,
        lead_id=lead_id,
        campaign_id=campaign_id,
        step_number=step_number,
        past_emails=past_emails,
        lead_context=lead_context,
    )

    # Fire draft_created so DraftService auto-approves and queues the send
    _notify_webhook("draft_created", {
        "job_id": job_id,
        "workspace_id": workspace_id,
        "lead_id": lead_id,
        "campaign_id": campaign_id,
        "subject": result.get("subject", f"Following up — Step {step_number}"),
        "body": result.get("body", "Hi, just following up on my previous email."),
        "verification_score": 0.85,
        "verification_reasons": [f"Follow-up step {step_number} generated by FollowUpAgent"],
        "followup_task_id": followup_task_id,
        "is_followup": True,
    })


def _notify_webhook(event_type: str, data: dict):
    payload = {"type": event_type, "data": data}
    raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    timestamp = str(int(time.time()))
    signed = timestamp.encode() + b"." + raw_body
    signature = hmac.new(config.WEBHOOK_SECRET.encode(), signed, hashlib.sha256).hexdigest()
    
    max_retries = 3
    base_delay = 1
    
    for attempt in range(max_retries + 1):
        try:
            response = requests.post(
                config.WEBHOOK_URL,
                data=raw_body,
                headers={"Content-Type": "application/json", "X-Webhook-Signature": signature, "X-Webhook-Timestamp": timestamp},
                timeout=10,
            )
            response.raise_for_status()
            return
        except Exception as err:
            print(f"Webhook delivery attempt {attempt + 1} failed for {event_type}: {err}")
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt)
                print(f"Retrying in {delay} seconds...")
                time.sleep(delay)
            else:
                print(f"Failed to deliver webhook {event_type} after {max_retries + 1} attempts.")


def report_rq_failure(job, connection, exc_type, exc_value, traceback):
    workspace_id = job.args[0] if len(job.args) > 0 else None
    job_id = job.args[3] if len(job.args) > 3 else job.id
    try:
        payload = {"job_id": job_id, "message": str(exc_value), "error_type": getattr(exc_type, "__name__", "WorkerFailure")}
        if workspace_id:
            payload["workspace_id"] = workspace_id
        _notify_webhook("job_failed", payload)
    except Exception as error:
        print(f"RQ failure callback could not notify backend: {error}")


# ─── New pipeline helpers ──────────────────────────────────────────────

def _emit_pipeline_event(job_id: str, step: str, status: str, message: str, workspace_id: str | None = None, **kwargs):
    """Emit an event from the new pipeline via webhook."""
    payload = {
        "job_id": job_id,
        "step": step,
        "status": status,
        "message": message,
        **kwargs,
    }
    if workspace_id:
        payload["workspace_id"] = workspace_id
    _notify_webhook("agent_event", payload)


def _save_pipeline_lead(
    job_id: str,
    workspace_id: str,
    email: str | None,
    business_name: str | None = None,
    website: str | None = None,
    phone: str | None = None,
    suburb: str | None = None,
    quality_score: float = 0.0,
    quality_flags: list | None = None,
    source_url: str | None = None,
    page_type: str | None = None,
    extraction_method: str | None = None,
    confidence_score: float | None = None,
    evidence: list | None = None,
    services: list | None = None,
):
    """Save a lead discovered by the new pipeline via the backend webhook."""
    _notify_webhook("lead_found", {
        "job_id": job_id,
        "workspace_id": workspace_id,
        "email": email,
        "business_name": business_name,
        "website_url": website,
        "phone": phone,
        "suburb": suburb,
        "source_url": source_url or website,
        "page_type": page_type or "website",
        "extraction_location": extraction_method or "regex",
        "extracted_fields": ["email", "business_name", "phone", "suburb", "services", "evidence"],
        "scraped_at": time.time(),
        "quality_score": quality_score,
        "quality_flags": quality_flags or [],
        "confidence_score": confidence_score if confidence_score is not None else quality_score,
        "evidence": evidence or [],
        "services": services or [],
    })
