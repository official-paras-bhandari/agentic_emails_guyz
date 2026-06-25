import json
from typing import Dict, Any, Optional
import litellm
from src.config import config
from src.services.memory_service import memory_service

class AutoVerificationAgent:
    def __init__(self):
        self.model = config.ACTIVE_MODEL
        self.api_key = config.get_llm_config()["llm"].get("api_key")

    def verify_draft(self, 
                     subject: str, 
                     body: str, 
                     workspace_id: str,
                     lead_id: str,
                     lead_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates an email draft for quality, risk, and personalization using memory.
        """
        # 1. Retrieve Memory
        memory = memory_service.get_relevant_memory(workspace_id, lead_id)
        
        workspace_facts = "\n".join([f"- {m['title']}: {m['content']}" for m in memory.get("workspace", [])])
        past_outcomes = "\n".join([f"- {m['eventType']}: {m['summary']}" for m in memory.get("outcomes", [])[:10]])

        prompt = f"""
        Analyze this cold outreach email for quality, factual accuracy, and risk.
        
        BUSINESS FACTS:
        {workspace_facts}
        
        PAST OUTCOMES (Avoid rejected patterns):
        {past_outcomes}
        
        Lead Context: {json.dumps(lead_context)}
        Subject: {subject}
        Body: {body}
        
        Return a JSON object with:
        - score (0.0 to 1.0): Quality/Confidence score.
        - status: "passed" or "failed".
        - reasons: Array of strings explaining the score.
        - requires_human_review: Boolean (true if risky, spammy, low personalization, or factually incorrect).
        
        CRITICAL CHECKS:
        1. Does it use correct business facts? (Check against BUSINESS FACTS)
        2. Does it include an unsubscribe instruction or clear opt-out?
        3. Does it avoid previously rejected patterns?
        4. Is it hallucinating anything not in context?
        """

        try:
            response = litellm.completion(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an AI Compliance & Quality Guard. Verify email drafts for professional standards and spam risk."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)
            return result
        except Exception as e:
            print(f"AutoVerificationAgent Error: {e}")
            return {
                "score": 0.0,
                "status": "failed",
                "reasons": [f"Verification error: {str(e)}"],
                "requires_human_review": True
            }
