import json
import os
import re
from typing import Dict, Any, Optional
import litellm
from src.config import config

class CommandUnderstandingAgent:
    def __init__(self):
        self.model = config.ACTIVE_MODEL
        self.api_key = config.get_llm_config()["llm"].get("api_key")
        self.is_simulation = not self.api_key or config.MOCK_MODE

    def _extract_explicit_country(self, prompt: str) -> str | None:
        p = prompt.lower()
        country_aliases = {
            "usa": "US",
            "us": "US",
            "united states": "US",
            "america": "US",
            "uk": "UK",
            "united kingdom": "UK",
            "england": "UK",
            "australia": "AU",
            "au": "AU",
            "nepal": "NP",
            "np": "NP",
        }
        for alias, code in country_aliases.items():
            if re.search(rf"\b{re.escape(alias)}\b", p):
                return code
        return None

    def understand(self, prompt: str, user_profile: Dict[str, Any] | None = None) -> Dict[str, Any]:
        clean_prompt = prompt.strip()
        if clean_prompt.startswith('"') and clean_prompt.endswith('"'):
            clean_prompt = clean_prompt[1:-1].strip()
        elif clean_prompt.startswith("'") and clean_prompt.endswith("'"):
            clean_prompt = clean_prompt[1:-1].strip()
            
        if clean_prompt.startswith("{") and clean_prompt.endswith("}"):
            try:
                data = json.loads(clean_prompt)
                if isinstance(data, dict) and (data.get("intent") or data.get("command_type")):
                    data["allowed"] = True
                    return data
            except Exception:
                pass

        if clean_prompt.lower().startswith("lead discovery for:"):
            clean_prompt = clean_prompt[len("lead discovery for:"):].strip()
        elif clean_prompt.lower().startswith("mission:"):
            clean_prompt = clean_prompt[len("mission:"):].strip()

        explicit_country = self._extract_explicit_country(clean_prompt)
        profile_country = (user_profile or {}).get("homeCountry")
        country = explicit_country or (profile_country if isinstance(profile_country, str) and profile_country else None)

        if self.is_simulation:
            return self.get_simulation_plan(clean_prompt, country=country)
            
        system_prompt = """
You are not a general assistant. You are an outreach automation agent for my own business. 
Your only job is to convert outreach-related user messages into structured command plans. 
If the message is not related to outreach, return intent = out_of_scope.

SPELLING & DICTATION CORRECTION:
- Correct spelling mistakes, phonetic typos, and dictation errors in locations and industries.
- E.g., if the user asks for "campuses" or "campises" or "campises" near Sydney/NSW, resolve and map it to the suburb "Campsie".
- E.g., "vectoria" maps to "Victoria".
- Always output the corrected official location name in the "location" field and correct industry name in the "industry" field.

ALLOWED DOMAINS:
- Find leads, search businesses, scrape public business contact info.
- Extract public emails, phone numbers, websites, source URLs.
- Deduplicate leads, enrich lead context.
- Write outreach emails, rewrite emails, generate follow-ups.
- Verify email quality.
- Send approved emails through Gmail.
- Check replies, detect unsubscribe replies, stop follow-ups.
- Export leads to Google Sheets.
- Show campaign performance, show job status, show agent logs.
- Use memory about business, leads, campaigns, and past outcomes.

BLOCKED DOMAINS:
- General coding help, homework, recipes, jokes, politics, medical/legal advice, image generation, unrelated business planning, general ChatGPT conversation.

RESPONSE FORMAT (JSON):
If allowed:
{
  "allowed": true,
  "intent": "scrape_leads", // one of: scrape_leads, find_businesses, enrich_leads, draft_emails, rewrite_emails, verify_drafts, send_emails, run_followups, check_replies, unsubscribe_or_block, export_leads, show_status, show_campaigns, show_memory, show_audit
  "goal": "...",
  "industry": "...",
  "location": "...",
  "quantity": 10,
  "requires_confirmation": true,
  "steps": [],
  "safety_checks": []
}

If blocked:
{
  "allowed": false,
  "intent": "out_of_scope",
  "message": "I’m focused on outreach tasks only. I can help you find leads, scrape public business contact info, write emails, manage follow-ups, check replies, and track campaigns."
}
        """.strip()

        try:
            response = litellm.completion(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": clean_prompt}
                ],
                response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)
            result.setdefault("parameters", {})
            if explicit_country:
                result["parameters"]["country"] = explicit_country
            elif country:
                result["parameters"]["country"] = country
            return result
        except Exception as e:
            print(f"Error in CommandUnderstandingAgent: {e}")
            return self.get_simulation_plan(clean_prompt, country=country)

    def get_simulation_plan(self, prompt: str, country: str | None = None) -> Dict[str, Any]:
        p = prompt.lower()
        
        # Blocked domains check for simulation
        blocked_keywords = ['recipe', 'code', 'game', 'homework', 'joke', 'capital of', 'politics', 'medical', 'legal', 'image', 'build me']
        if any(word in p for word in blocked_keywords):
            return {
                "allowed": False,
                "intent": "out_of_scope",
                "message": "I’m focused on outreach tasks only. I can help you find leads, scrape public business contact info, write emails, manage follow-ups, check replies, and track campaigns."
            }

        scrape_keywords = ["find", "scrape", "extract", "get", "leads", "business", "salon", "plumber", "prospect", "gather", "collect"]
        if any(word in p for word in scrape_keywords):
            quantity_match = re.search(r"\b(\d{1,3})\b", p)
            quantity = min(int(quantity_match.group(1)), config.MAX_SITES_PER_JOB) if quantity_match else 5
            industry_match = re.search(r"(?:find|scrape|extract|get|gather|collect)\s+(?:\d+\s+)?([a-z][a-z\s&-]*?)(?:\s+in\s+|$)", p)
            
            industry = industry_match.group(1).strip() if industry_match else "businesses"
            if "salon" in p:
                industry = "salons"
            elif "plumber" in p:
                industry = "plumbers"
                
            location_match = re.search(r"\bin\s+([a-z][a-z\s-]*)", p)
            location = location_match.group(1).strip() if location_match else "Sydney"
            
            # Apply basic dictation corrections in simulation
            loc_lower = location.lower()
            if loc_lower in {"campuses", "campises", "campoise", "campes"}:
                location = "Campsie"
                if "salon" not in p and "plumber" not in p:
                    industry = "businesses"
            elif loc_lower == "vectoria":
                location = "Victoria"
            else:
                location = location.title()

            if "from campuses in" in p or "from campises in" in p or "from campoise in" in p:
                location = "Campsie"
                if "salon" not in p and "plumber" not in p:
                    industry = "businesses"

            return {
                "allowed": True,
                "intent": "scrape_leads",
                "goal": f"Lead discovery for: {prompt}",
                "industry": industry,
                "location": location,
                "quantity": quantity,
                "requires_confirmation": True,
                "parameters": {
                    "industry": industry,
                    "location": location,
                    "quantity": quantity,
                    **({"country": country} if country else {}),
                },
                "intent_flags": {
                    "drafting_requested": "draft" in p or "email" in p,
                    "sending_requested": "send" in p,
                    "approval_required": True
                },
                "steps": [
                    "Initialize ScrapeGraphAI Harvester",
                    "Crawl business directories",
                    "Extract emails from contact pages",
                    "Filter duplicates in local database"
                ],
                "safety_checks": [
                    "Simulation mode fallback active" if self.is_simulation else "Production mode",
                    "Backend dedupe logic active",
                    "User approval required before next step"
                ]
            }
        
        # Check for other allowed intents in simulation
        allowed_keywords = {
            "draft_emails": ["draft", "write email"],
            "rewrite_emails": ["rewrite", "shorter", "longer", "tone", "make these"],
            "send_emails": ["send email", "gmail", "dispatch"],
            "check_replies": ["check replies", "inbox", "responses"],
            "show_campaigns": ["campaign", "performance", "stats"],
            "export_leads": ["export", "google sheets", "csv"],
            "unsubscribe_or_block": ["unsubscribe", "stop", "block", "remove"],
            "show_status": ["status", "job", "logs"],
            "show_memory": ["memory", "past", "history"],
            "show_audit": ["audit", "logs"]
        }
        
        for intent, keywords in allowed_keywords.items():
            if any(word in p for word in keywords):
                return {
                    "allowed": True,
                    "intent": intent,
                    "goal": f"Handling: {prompt}",
                    "steps": [f"Execution of {intent}"],
                    "safety_checks": ["Standard security filters"]
                }

        return {
            "allowed": False,
            "intent": "out_of_scope",
            "message": "I’m focused on outreach tasks only. I can help you find leads, scrape public business contact info, write emails, manage follow-ups, check replies, and track campaigns."
        }
