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
            "usa": "United States",
            "us": "United States",
            "united states": "United States",
            "america": "United States",
            "uk": "United Kingdom",
            "united kingdom": "United Kingdom",
            "england": "United Kingdom",
            "australia": "Australia",
            "au": "Australia",
            "nepal": "Nepal",
            "np": "Nepal",
        }
        for alias, name in country_aliases.items():
            if re.search(rf"\b{re.escape(alias)}\b", p):
                return name
        return None

    def understand(
        self,
        prompt: str,
        user_profile: Dict[str, Any] | None = None,
        workspace_profile: Dict[str, Any] | None = None
    ) -> Dict[str, Any]:
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

        if self.is_simulation:
            return self.get_simulation_plan(clean_prompt, user_profile, workspace_profile)
            
        system_prompt = f"""
You are not a general assistant. You are an outreach automation agent for my own business. 
Your only job is to convert outreach-related user messages into structured command plans. 
If the message is not related to outreach, return intent = out_of_scope.

LOCATION RESOLUTION PRECEDENCE RULES:
You must resolve the target location (city/region/suburb) and country based on these precedence rules:
1. Explicit location and/or country mentioned in the user prompt (e.g., "Find salons in Sydney, Australia" -> location="Sydney", country="Australia").
2. If no location in prompt, use the workspace profile target market default city/region and default country.
3. If still no location, use the user's home country.
4. If none of these are available, you MUST reject the request (set "allowed": false, "intent": "out_of_scope") and ask the user to clarify their target location.

IMPORTANT: Do not set location = country. Keep country and location (city/region/suburb) as separate fields in the parameters!

CONTEXT PASSED:
UserProfile: {json.dumps(user_profile or {})}
WorkspaceProfile: {json.dumps(workspace_profile or {})}

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
{{
  "allowed": true,
  "intent": "scrape_leads", // one of: scrape_leads, find_businesses, enrich_leads, draft_emails, rewrite_emails, verify_drafts, send_emails, run_followups, check_replies, unsubscribe_or_block, export_leads, show_status, show_campaigns, show_memory, show_audit
  "goal": "...",
  "industry": "...",
  "location": "...",
  "country": "...",
  "quantity": 10,
  "requires_confirmation": true,
  "steps": [],
  "safety_checks": [],
  "parameters": {{
    "industry": "...",
    "location": "...",
    "country": "...",
    "quantity": 10
  }}
}}

If blocked/clarification required:
{{
  "allowed": false,
  "intent": "out_of_scope",
  "message": "Please specify the location (city or region) where you want to find leads."
}}
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
            # Guarantee parameters exists
            result.setdefault("parameters", {})
            if "industry" in result and "industry" not in result["parameters"]:
                result["parameters"]["industry"] = result["industry"]
            if "location" in result and "location" not in result["parameters"]:
                result["parameters"]["location"] = result["location"]
            if "country" in result and "country" not in result["parameters"]:
                result["parameters"]["country"] = result["country"]
            if "quantity" in result and "quantity" not in result["parameters"]:
                result["parameters"]["quantity"] = result["quantity"]
            return result
        except Exception as e:
            print(f"Error in CommandUnderstandingAgent LLM: {e}")
            return self.get_simulation_plan(clean_prompt, user_profile, workspace_profile)

    def get_simulation_plan(
        self,
        prompt: str,
        user_profile: Dict[str, Any] | None = None,
        workspace_profile: Dict[str, Any] | None = None
    ) -> Dict[str, Any]:
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

            # 1. Resolve explicit location/country from prompt
            explicit_location = None
            explicit_country = self._extract_explicit_country(prompt)
            
            location_match = re.search(r"\bin\s+([a-z][a-z\s,-]*)", p)
            if location_match:
                loc_cand = location_match.group(1).strip()
                if "," in loc_cand:
                    parts = loc_cand.split(",")
                    explicit_location = parts[0].strip().title()
                else:
                    explicit_location = loc_cand.strip().title()

            # Apply simulation spelling/dictation corrections
            if explicit_location:
                loc_lower = explicit_location.lower()
                if loc_lower in {"campuses", "campises", "campoise", "campes"}:
                    explicit_location = "Campsie"
                elif loc_lower == "vectoria":
                    explicit_location = "Victoria"
                else:
                    explicit_location = explicit_location.title()

            # 2. Precedence logic resolution
            resolved_location = None
            resolved_country = None

            if explicit_location:
                resolved_location = explicit_location
                resolved_country = explicit_country or (workspace_profile or {}).get("defaultCountry") or (user_profile or {}).get("homeCountry")
            elif workspace_profile and (workspace_profile.get("defaultCity") or workspace_profile.get("defaultRegion")):
                resolved_location = workspace_profile.get("defaultCity") or workspace_profile.get("defaultRegion")
                resolved_country = workspace_profile.get("defaultCountry")
            elif user_profile and user_profile.get("homeCountry"):
                resolved_country = user_profile.get("homeCountry")
                resolved_location = "Sydney" if resolved_country.lower() in {"au", "australia"} else "New York"

            # If no location/country can be resolved, ask for clarification (blocked)
            if not resolved_location:
                return {
                    "allowed": False,
                    "intent": "out_of_scope",
                    "message": "Please specify the location (city or region) where you want to find leads."
                }

            return {
                "allowed": True,
                "intent": "scrape_leads",
                "goal": f"Lead discovery for: {prompt}",
                "industry": industry,
                "location": resolved_location,
                "country": resolved_country,
                "quantity": quantity,
                "requires_confirmation": True,
                "parameters": {
                    "industry": industry,
                    "location": resolved_location,
                    "country": resolved_country,
                    "quantity": quantity,
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
                    "Simulation mode fallback active",
                    "Backend dedupe logic active",
                    "User approval required before next step"
                ]
            }
        
        # Check other allowed intents in simulation
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
