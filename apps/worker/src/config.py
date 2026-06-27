import os
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Model Configuration
    ACTIVE_MODEL = os.getenv("ACTIVE_MODEL", "openai/gpt-4o")
    
    # API Keys
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    
    # Webhook Configuration
    WEBHOOK_URL = os.getenv("WEBHOOK_URL", "http://localhost:3000/api/webhooks/worker")
    WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")
    
    # Infrastructure
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
    INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")
    
    # Modes
    MOCK_MODE = os.getenv("MOCK_MODE", "true").lower() == "true"

    # Scraping Configuration
    MAX_SITES_PER_JOB = int(os.getenv("MAX_SITES_PER_JOB", "10"))
    MAX_PAGES_PER_SITE = int(os.getenv("MAX_PAGES_PER_SITE", "3"))
    SCRAPE_TIMEOUT_SECONDS = int(os.getenv("SCRAPE_TIMEOUT_SECONDS", "60"))
    SCRAPE_CONCURRENCY = int(os.getenv("SCRAPE_CONCURRENCY", "2"))
    SEARCH_ENGINE = os.getenv("SEARCH_ENGINE", "duckduckgo") # google, duckduckgo, bing
    SCRAPEGRAPH_FALLBACK_MAX_CALLS = int(os.getenv("SCRAPEGRAPH_FALLBACK_MAX_CALLS", "5"))
    MAX_CONCURRENT_RENDERS_GLOBAL = int(os.getenv("MAX_CONCURRENT_RENDERS_GLOBAL", "5"))
    MAX_CONCURRENT_RENDERS_PER_DOMAIN = int(os.getenv("MAX_CONCURRENT_RENDERS_PER_DOMAIN", "1"))
    MAX_CONCURRENT_RENDERS_PER_USER = int(os.getenv("MAX_CONCURRENT_RENDERS_PER_USER", "2"))
    MAX_RENDER_TIME_SECONDS = int(os.getenv("MAX_RENDER_TIME_SECONDS", "30"))
    MAX_RENDERED_PAGES_PER_JOB = int(os.getenv("MAX_RENDERED_PAGES_PER_JOB", "10"))
    MAX_RENDERED_PAGES_PER_DOMAIN_PER_JOB = int(os.getenv("MAX_RENDERED_PAGES_PER_DOMAIN_PER_JOB", "3"))
    # Source strategy: duckduckgo | yellowpages | truelocal | google_maps
    SCRAPE_SOURCE = os.getenv("SCRAPE_SOURCE", "yellowpages")
    # Home country used as fallback when location can't be detected from query
    # Options: au | us | uk | global
    HOME_COUNTRY  = os.getenv("HOME_COUNTRY", "au")
    SCRAPE_HEADLESS = os.getenv("SCRAPE_HEADLESS", "true").lower() == "true"

    def __init__(self):
        if not self.WEBHOOK_SECRET:
            raise ValueError("WEBHOOK_SECRET must be set in environment variables.")
        if self.SCRAPE_CONCURRENCY < 1 or self.SCRAPE_CONCURRENCY > 10:
            raise ValueError("SCRAPE_CONCURRENCY must be between 1 and 10")
        if self.MAX_SITES_PER_JOB < 1 or self.MAX_SITES_PER_JOB > 100:
            raise ValueError("MAX_SITES_PER_JOB must be between 1 and 100")
        if self.SCRAPEGRAPH_FALLBACK_MAX_CALLS < 0 or self.SCRAPEGRAPH_FALLBACK_MAX_CALLS > 50:
            raise ValueError("SCRAPEGRAPH_FALLBACK_MAX_CALLS must be between 0 and 50")
        if self.MAX_CONCURRENT_RENDERS_GLOBAL < 1:
            raise ValueError("MAX_CONCURRENT_RENDERS_GLOBAL must be at least 1")
        if self.MAX_CONCURRENT_RENDERS_PER_DOMAIN < 1:
            raise ValueError("MAX_CONCURRENT_RENDERS_PER_DOMAIN must be at least 1")
        if self.MAX_CONCURRENT_RENDERS_PER_USER < 1:
            raise ValueError("MAX_CONCURRENT_RENDERS_PER_USER must be at least 1")
        if self.MAX_RENDER_TIME_SECONDS < 1 or self.MAX_RENDER_TIME_SECONDS > 120:
            raise ValueError("MAX_RENDER_TIME_SECONDS must be between 1 and 120")
        if self.MAX_RENDERED_PAGES_PER_JOB < 1:
            raise ValueError("MAX_RENDERED_PAGES_PER_JOB must be at least 1")
        if self.MAX_RENDERED_PAGES_PER_DOMAIN_PER_JOB < 1:
            raise ValueError("MAX_RENDERED_PAGES_PER_DOMAIN_PER_JOB must be at least 1")

    def get_llm_config(self) -> Dict[str, Any]:
        """Returns the configuration for ScrapeGraphAI and LiteLLM."""
        model_prefix = self.ACTIVE_MODEL.split('/')[0] if '/' in self.ACTIVE_MODEL else "openai"
        model_name = self.ACTIVE_MODEL.split('/')[-1] if '/' in self.ACTIVE_MODEL else self.ACTIVE_MODEL
        
        cfg = {
            "llm": {
                "model": f"openai/{model_name}" if model_prefix == "deepseek" else self.ACTIVE_MODEL,
                "temperature": 0,
            }
        }

        # Inject specific API keys based on provider
        if model_prefix == "openai":
            cfg["llm"]["api_key"] = self.OPENAI_API_KEY
        elif model_prefix == "gemini":
            cfg["llm"]["api_key"] = self.GEMINI_API_KEY
        elif model_prefix == "anthropic":
            cfg["llm"]["api_key"] = self.ANTHROPIC_API_KEY
        elif model_prefix == "deepseek":
            cfg["llm"]["api_key"] = self.DEEPSEEK_API_KEY
            cfg["llm"]["openai_api_base"] = "https://api.deepseek.com/v1"
            cfg["llm"]["base_url"] = "https://api.deepseek.com/v1"
        elif model_prefix == "groq":
            cfg["llm"]["api_key"] = self.GROQ_API_KEY
            
        return cfg

    def get_embeddings_config(self) -> Dict[str, Any]:
        """Returns embedding config."""
        if self.OPENAI_API_KEY:
            return {
                "embeddings": {
                    "model": "openai/text-embedding-3-small",
                    "api_key": self.OPENAI_API_KEY
                }
            }
        if self.GEMINI_API_KEY:
            return {
                "embeddings": {
                    "model": "gemini/models/embedding-001",
                    "api_key": self.GEMINI_API_KEY
                }
            }
        
        from langchain_core.embeddings import FakeEmbeddings
        return {
            "embeddings": {
                "model": "openai/text-embedding-3-small",
                "model_instance": FakeEmbeddings(size=1536)
            }
        }

config = Config()
