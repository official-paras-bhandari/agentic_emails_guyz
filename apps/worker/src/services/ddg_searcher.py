"""
DuckDuckGoSearcher — handles DuckDuckGo queries safely using rate limits,
cooldown periods, user-agent rotations, and exponential backoff.
"""

import time
import random
from typing import List
from ddgs import DDGS

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

class DuckDuckGoSearcher:
    """Manages search queries executing against DuckDuckGo without triggering rate blocks."""

    def __init__(self):
        self.queries_run = 0
        self.session_queries = 0
        self.cooldown_limit = 30
        self.user_agent_rotate_limit = 10
        self.current_ua = _USER_AGENTS[0]
        self.backoff_delay = 60

    def search(self, query: str, emit_event=None) -> List[str]:
        """
        Execute a search query on DuckDuckGo.
        Enforces random delays, session cooldowns, user-agent rotations, and 429 backoff.
        """
        # 1. Enforce delay before query (Section 11: 3-5 seconds with random jitter)
        delay = random.uniform(3.0, 5.0)
        time.sleep(delay)

        # 2. Check for session cooldown limit (Section 11: 30 queries limit)
        if self.session_queries >= self.cooldown_limit:
            # 10-15 minutes cooldown
            cooldown_sec = random.uniform(600, 900)
            if emit_event:
                emit_event(
                    step="searching", status="info",
                    message=f"Session query limit ({self.cooldown_limit}) reached. Cooling down for {int(cooldown_sec/60)} minutes..."
                )
            time.sleep(cooldown_sec)
            self.session_queries = 0
            self.backoff_delay = 60

        # 3. User-Agent rotation (Section 11: Rotate every 10 queries)
        if self.queries_run > 0 and self.queries_run % self.user_agent_rotate_limit == 0:
            self.current_ua = random.choice(_USER_AGENTS)

        try:
            # Execute search
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=15))
                urls = [r.get("href") for r in results if r.get("href")]
                
                self.queries_run += 1
                self.session_queries += 1
                self.backoff_delay = 60 # Reset backoff
                return urls
        except Exception as e:
            err_msg = str(e)
            print(f"[DuckDuckGoSearcher] Error searching '{query}': {err_msg}")
            
            # 4. 429 behaviour (Section 11: Exponential backoff, minimum 60 seconds)
            if "429" in err_msg or "too many requests" in err_msg.lower() or "ratelimit" in err_msg.lower():
                if emit_event:
                    emit_event(
                        step="searching", status="warning",
                        message=f"DuckDuckGo rate limit hit. Backing off for {self.backoff_delay} seconds."
                    )
                time.sleep(self.backoff_delay)
                self.backoff_delay = min(self.backoff_delay * 2, 600) # Exp backoff capped at 10 minutes
            return []
