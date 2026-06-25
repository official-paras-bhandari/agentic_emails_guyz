import json
from typing import Dict, Any, List, Optional
import litellm
from src.config import config
from src.services.memory_service import memory_service

class EmailWriterAgent:
    def __init__(self):
        self.model = config.ACTIVE_MODEL
        self.api_key = config.get_llm_config()["llm"].get("api_key")
        self.is_simulation = not self.api_key or config.MOCK_MODE

    def write_draft(self, 
                    workspace_id: str, 
                    lead_id: str, 
                    campaign_id: Optional[str], 
                    lead_context: Dict[str, Any],
                    instructions: Optional[str] = None) -> Dict[str, Any]:
        
        if self.is_simulation:
            business = lead_context.get("businessName") or lead_context.get("business_name") or "there"
            location = lead_context.get("suburb")
            context = f" in {location}" if location else ""
            return {
                "subject": f"A quick question for {business}",
                "body": f"Hi {business} team,\n\nI came across your public business website{context} and wanted to ask whether improving your booking and customer follow-up workflow is currently a priority. If useful, I can share a concise overview.\n\nBest,\nAzura team",
                "quality_score": 0.75,
                "confidence_score": 0.8,
                "reasons": ["Grounded only in the scraped business name and location", "Manual review required in mock mode"]
            }

        # 1. Retrieve Memory
        memory = memory_service.get_relevant_memory(workspace_id, lead_id, campaign_id)
        
        # 2. Format Memory for Prompt
        workspace_facts = "\n".join([f"- {m['title']}: {m['content']}" for m in memory.get("workspace", [])])
        lead_memories = "\n".join([f"- {m['memoryType']}: {m['content']}" for m in memory.get("lead", [])])
        past_outcomes = "\n".join([f"- {m['eventType']}: {m['summary']}" for m in memory.get("outcomes", [])[:5]])

        # Separate email_template memories from general campaign learnings
        campaign_mems = memory.get("campaign", [])
        email_templates = [m for m in campaign_mems if m.get("memoryType") == "email_template"]
        other_learnings = [m for m in campaign_mems if m.get("memoryType") != "email_template"]

        campaign_learnings = "\n".join([f"- {m['memoryType']}: {m['content']}" for m in other_learnings])

        # Format email templates with clear instructions to use them
        templates_section = ""
        if email_templates:
            import json as _json
            template_texts = []
            for i, tmpl in enumerate(email_templates):
                try:
                    t = _json.loads(tmpl["content"])
                    template_texts.append(
                        f"Template {i+1} ({t.get('step', 'initial')}):\n"
                        f"  Subject hint: {t.get('subject', '')}\n"
                        f"  Opening: {t.get('opening', '')}\n"
                        f"  Value prop: {t.get('value_prop', '')}\n"
                        f"  CTA: {t.get('cta', '')}\n"
                        f"  Tone: {t.get('tone', 'professional')}"
                    )
                except Exception:
                    template_texts.append(tmpl["content"])
            templates_section = "\n\n".join(template_texts)

        # 3. Construct Prompt
        system_prompt = f"""
        You are an expert cold outreach specialist. Your goal is to write a personalized, high-converting email.
        
        BUSINESS FACTS (Workspace Memory):
        {workspace_facts}
        
        LEAD KNOWLEDGE (Lead Memory):
        {lead_memories}
        
        CAMPAIGN LEARNINGS:
        {campaign_learnings}
        
        PAST OUTCOMES & FEEDBACK:
        {past_outcomes}
        
        {"CAMPAIGN EMAIL BLUEPRINT (USE THESE AS YOUR STRUCTURAL AND TONAL BASIS):" + chr(10) + templates_section if templates_section else ""}
        
        CORE RULES:
        - Follow the campaign email blueprint structure and tone above — adapt it for the specific lead.
        - Use business facts correctly. Never hallucinate features or pricing.
        - Be friendly, direct, and professional.
        - Follow tone preferences if provided in Workspace Memory.
        - Use lead-specific personalization from Lead Knowledge.
        - Never hallucinate facts not in memory or lead context.
        """

        user_prompt = f"""
        Lead Context: {json.dumps(lead_context)}
        Specific Instructions: {instructions or 'Write a compelling first outreach email.'}
        
        Return a JSON object with:
        - subject: The email subject line.
        - body: The email body content.
        - quality_score: A float from 0 to 1 based on personalization and adherence to rules.
        - confidence_score: A float from 0 to 1.
        - reasons: A list of strings explaining the scores.
        """

        try:
            response = litellm.completion(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)
            
            # Record outcome in memory for future learning
            if lead_id:
                memory_service.create_memory("outcome_memory", {
                    "workspaceId": workspace_id,
                    "leadId": lead_id,
                    "campaignId": campaign_id,
                    "eventType": "ai_draft_generated",
                    "summary": f"Draft generated with score {result.get('quality_score')}",
                    "scoreImpact": result.get('quality_score', 0)
                })
                
            return result
        except Exception as e:
            print(f"EmailWriterAgent Error: {e}")
            return {
                "subject": "Quick idea for your business",
                "body": f"Hi there,\n\nI was looking at your website and had an idea for how we could help with your booking process.\n\nBest,\nTeam"
            }
