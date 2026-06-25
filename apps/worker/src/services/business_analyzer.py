import json
import logging
from typing import Dict, Any

from src.services.browser_pool import BrowserPool, browser_pool as default_browser_pool
from src.config import config
import litellm

logger = logging.getLogger(__name__)

class BusinessAnalyzer:
    def __init__(self, job_id: str, emit_event_fn, browser_pool: BrowserPool = None):
        self.job_id = job_id
        self.emit_event = emit_event_fn
        self.browser_pool = browser_pool or default_browser_pool
        self.model = "gpt-4o-mini"

    def analyze(self, campaign_id: str, website_url: str):
        try:
            self.emit_event("step_running", {"step": "crawling", "message": f"Crawling business website: {website_url}"})
            
            # Fetch the page content
            html = self.browser_pool.fetch_page(website_url)
            if not html:
                raise ValueError("Could not fetch the website.")
                
            # Basic text extraction from HTML (very simplistic here, browser pool usually runs JS, we could use BeautifulSoup)
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")
            for script in soup(["script", "style"]):
                script.extract()
            text = soup.get_text(separator=" ", strip=True)
            
            # Truncate text to avoid massive token usage
            text = text[:15000]

            self.emit_event("step_running", {"step": "summarizing", "message": "Analyzing business content with AI..."})
            
            prompt = f"""
You are an expert B2B marketer. Analyze the following text extracted from a business website and provide a JSON response with three fields:
1. "business_description": A clear, compelling 2-3 sentence description of what the business does and their unique value proposition.
2. "target_persona": A short description of the ideal customer persona they target.
3. "email_templates": An array of exactly 4 progressive cold email templates (each having a "subject" and "body") that this business could use to reach out to their target persona. The sequence must incorporate B2B outreach best practices:
   - **Email 1: Initial Outreach (Relevance & Soft Ask)**: Keep it highly relevant, brief, and ask permission first to share a valuable resource or idea (rather than pitching a meeting).
   - **Email 2: Follow-up 1 (Timing & Value)**: A short, friendly, and helpful follow-up sent a few days later, keeping the conversation top-of-mind and adding quick value.
   - **Email 3: Follow-up 2 (Credibility & Social Proof)**: Build credibility by referencing case studies, statistics, or respected brands/clients you've worked with, proving your capability.
   - **Email 4: Follow-up 3 (Creativity & Clean Break-up)**: A creative, polite final check-in/break-up email that is lighthearted, giving them a clean way to opt-out or reply.

Website Text:
{text}
"""
            if config.MOCK_MODE or not config.OPENAI_API_KEY:
                logger.info("Running business analysis in simulation/mock mode.")
                result_json = {
                    "business_description": f"A premier local business located at {website_url} specializing in high-quality professional services customized for their community clients.",
                    "target_persona": "Local residents, busy professionals, and families seeking premium reliable services.",
                    "email_templates": [
                        {
                            "subject": "Quick question regarding your business operations",
                            "body": "Hi {{first_name}},\n\nI was looking at {{company_name}}'s website and noticed you have a stellar list of professional services. \n\nWe've been working on a new strategy to streamline client scheduling specifically for local service providers. Before putting it live, I wanted to ask: would it be alright if I sent over a 2-minute overview of how this can automate your bookings?\n\nNo pressure at all, just wanted to check first.\n\nBest regards,\n{{sender_name}}"
                        },
                        {
                            "subject": "Re: Quick question regarding your business operations",
                            "body": "Hi {{first_name}},\n\nI know you're busy running things, so I wanted to bump this to the top of your inbox. \n\nI actually did a quick review of your page loading times and noticed a few tweaks that could help prevent client drop-off during checkout. If the timing is right, I'd be happy to share those details.\n\nLet me know if you're open to it.\n\nBest,\n{{sender_name}}"
                        },
                        {
                            "subject": "Case study: 30% increase in local bookings",
                            "body": "Hi {{first_name}},\n\nThought you might appreciate this: we recently helped a business similar to {{company_name}} increase their monthly appointments by 30% by optimizing their automated booking flows (without spending more on ads).\n\nWe've also worked with respected service brands in your region to implement the same setup.\n\nIf you'd like to see how we did it, let me know and I can send over the case study.\n\nThanks,\n{{sender_name}}"
                        },
                        {
                            "subject": "Re: Case study: 30% increase in local bookings",
                            "body": "Hi {{first_name}},\n\nSince I haven't heard back, I'll assume that optimizing booking automation isn't a priority for {{company_name}} right now. Completely understand!\n\nIf anything changes or if you ever want to revisit this, feel free to reach out. Otherwise, this is the last you'll hear from me.\n\nWishing you the best of luck with your business!\n\nBest regards,\n{{sender_name}}"
                        }
                    ]
                }
            else:
                response = litellm.completion(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"}
                )
                result_text = response.choices[0].message.content
                result_json = json.loads(result_text)
            
            # Notify backend with the results
            self.emit_event("business_analyzed", {
                "campaign_id": campaign_id,
                "business_website": website_url,
                "business_description": result_json.get("business_description", ""),
                "target_persona": result_json.get("target_persona", ""),
                "email_templates": result_json.get("email_templates", [])
            })
            
            self.emit_event("step_completed", {"step": "summarizing", "message": "Analysis completed."})
            
        except Exception as e:
            logger.error(f"Error analyzing business: {e}")
            self.emit_event("step_failed", {"step": "analyzing", "message": str(e)})
            raise
