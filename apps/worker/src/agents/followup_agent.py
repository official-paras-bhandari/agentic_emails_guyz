import json
from typing import Dict, Any, List, Optional
import litellm
from src.config import config
from src.services.memory_service import memory_service

class FollowUpAgent:
    def __init__(self):
        self.model = config.ACTIVE_MODEL
        self.api_key = config.get_llm_config()["llm"].get("api_key")
        self.is_simulation = not self.api_key or config.MOCK_MODE

    def write_followup(self, 
                       workspace_id: str, 
                       lead_id: str, 
                       campaign_id: Optional[str], 
                       step_number: int,
                       past_emails: List[Dict[str, Any]],
                       lead_context: Dict[str, Any]) -> Dict[str, Any]:
        if self.is_simulation:
            prior_subject = past_emails[-1]["subject"] if past_emails else "Following up"
            business = lead_context.get("businessName") or lead_context.get("business_name") or "there"
            return {
                "subject": f"Re: {prior_subject}",
                "body": (
                    f"Hi {business},\n\n"
                    "Just following up on my last note in case it got buried.\n\n"
                    "If improving booking flow or customer follow-up is still relevant, "
                    "I can send over a short overview.\n\n"
                    "Best,\nAzura team"
                ),
            }
        
        # 1. Retrieve Memory
        memory = memory_service.get_relevant_memory(workspace_id, lead_id, campaign_id)
        
        workspace_facts = "\n".join([f"- {m['title']}: {m['content']}" for m in memory.get("workspace", [])])
        campaign_learnings = "\n".join([f"- {m['memoryType']}: {m['content']}" for m in memory.get("campaign", [])])
        
        # 2. Format Past Emails
        history = "\n\n".join([f"Email {i+1}:\nSubject: {e['subject']}\nBody: {e['body']}" for i, e in enumerate(past_emails)])

        # 3. Construct Prompt
        system_prompt = f"""
        You are an expert cold outreach specialist focusing on follow-ups.
        
        BUSINESS FACTS:
        {workspace_facts}
        
        CAMPAIGN LEARNINGS:
        {campaign_learnings}
        
        PAST EMAIL HISTORY:
        {history}
        
        CORE RULES:
        - Acknowledge the previous outreach without being repetitive.
        - Be shorter and more direct than the first email.
        - Focus on a specific benefit or a low-friction call to action.
        - Never hallucinate facts.
        """

        user_prompt = f"""
        Lead Context: {json.dumps(lead_context)}
        Follow-up Step: {step_number}
        
        Return a JSON object with:
        - subject: The follow-up subject line (keep it the same or a slight variation).
        - body: The follow-up email body.
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
            return result
        except Exception as e:
            print(f"FollowUpAgent Error: {e}")
            return {
                "subject": f"Re: {past_emails[-1]['subject']}" if past_emails else "Following up",
                "body": "Hi there,\n\nJust wanted to quickly follow up on my previous email. Did you have a chance to look at it?\n\nBest,\nTeam"
            }
