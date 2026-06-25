import json
from typing import Dict, Any, List, Optional
import litellm
from src.config import config

class LeadEnrichmentAgent:
    def __init__(self):
        self.model = config.ACTIVE_MODEL
        self.api_key = config.get_llm_config()["llm"].get("api_key")
        self.is_simulation = not self.api_key or config.MOCK_MODE

    def enrich(self, workspace_id: str, lead_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Takes lead context (which might contain scraped website data, business name, etc.)
        and generates a summary and personalization points.
        """
        if self.is_simulation:
            business = lead_context.get("businessName") or lead_context.get("business_name") or "the business"
            return {
                "summary": f"{business} is a business identified via automated discovery.",
                "personalization": f"Noticed {business} in the specified location.",
                "quality_score": 0.5,
                "confidence_score": 0.8
            }

        system_prompt = """
        You are an expert Lead Enrichment and Business Intelligence specialist.
        Your goal is to analyze the provided raw scraped context about a business and return structured intelligence.
        
        Focus on:
        - Summarizing what the business does (1-2 sentences).
        - Finding 1 or 2 strong personalization points that could be used in a cold email (e.g. recent news, unique value prop, mission).
        - Giving a quality_score (0.0 to 1.0) on how complete and compelling this lead is for outreach.
        
        Return a JSON object with exactly these fields:
        - summary (string)
        - personalization (string)
        - quality_score (float)
        - confidence_score (float)
        """

        user_prompt = f"Raw Lead Data:\n{json.dumps(lead_context, indent=2)}"

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
            print(f"LeadEnrichmentAgent Error: {e}")
            return {
                "summary": f"Could not enrich data due to an error.",
                "personalization": "",
                "quality_score": 0.0,
                "confidence_score": 0.0
            }
