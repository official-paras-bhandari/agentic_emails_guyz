import json
from typing import Dict, Any, List, Optional
import litellm
from src.config import config

class ReplyClassifierAgent:
    def __init__(self):
        self.model = config.ACTIVE_MODEL
        self.api_key = config.get_llm_config()["llm"].get("api_key")

    def classify(self, content: str) -> Dict[str, Any]:
        """
        Classifies an incoming email reply.
        Returns:
            classification: interested, not_interested, unsubscribe, bounce, auto_reply, needs_human_reply, unknown
            confidence: 0-1
            reason: Explanation
        """
        system_prompt = """
        You are a highly accurate Email Reply Classifier. Your goal is to determine the intent of a recipient's reply to a cold outreach email.
        
        CLASSIFICATION TYPES:
        - interested: Lead wants to talk, book a meeting, or asks for more info.
        - not_interested: Lead says "not now", "no thanks", "already have a solution".
        - unsubscribe: Lead says "STOP", "unsubsribe", "remove me", "don't contact me again", "take me off your list".
        - bounce: Automatic system message about failed delivery.
        - auto_reply: Out of office, vacation responder.
        - needs_human_reply: Complex questions or specific requests that require a human.
        - unknown: Content is too short or ambiguous.
        
        RULES:
        - If there is ANY mention of removing them from the list or stopping contact, mark as 'unsubscribe'.
        - Be conservative. If unsure if 'interested', use 'needs_human_reply'.
        """

        try:
            response = litellm.completion(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Analyze this reply:\n\n{content}"}
                ],
                response_format={"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"ReplyClassifierAgent Error: {e}")
            return {
                "classification": "unknown",
                "confidence": 0,
                "reason": str(e)
            }
