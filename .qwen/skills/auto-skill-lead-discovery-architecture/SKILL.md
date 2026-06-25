---
name: lead-discovery-architecture
description: The locked lead discovery pipeline architecture — regex-first extraction, multi-service design, and engineering rules for the Agentic Outreach lead scraping system.
source: auto-skill
extracted_at: '2026-06-21T11:17:36.044Z'
---

# Lead Discovery Architecture

## Core Engineering Rule

```
Search broadly.
Crawl cheaply.
Extract deterministically.
Use LLM only for hard cases.
Cache everything.
Save evidence.
Never send without ContactPolicyService.
```

## Pipeline Flow

```
User Prompt
→ CommandUnderstandingAgent (parse industry, location, quantity)
→ LocationExpansionService (static JSON suburbs — no API cost)
→ QueryPlannerService (~80 targeted search queries)
→ QueryRateLimiter (batches of 10, 1-3s delay, random jitter)
→ DuckDuckGo SearchProvider (free, no API key needed)
→ URLClassifierService (business website vs directory vs bad)
→ DomainDedupe (unique domains only)
→ WebsiteCacheService (7-day TTL, skip if cached)
→ WebsiteCrawler (fetch HTML)
→ CheapContactExtractor (mailto, regex, JSON-LD, phone, socials)
→ HardCaseExtractor (ScrapeGraphAI fallback ONLY for messy pages)
→ LeadQualityGate (syntax, MX, disposable, role email, ICP score)
→ ContactPolicyService (canDiscoverLead)
→ CRM Save (Lead + Source + Enrichment + Evidence)
→ Campaign Routing → Draft → Approval → Queue Send
```

## Key Design Decisions

### No Google Paid API for MVP
- Use DuckDuckGo (free, via ddgs Python package)
- Directories as fallback sources (Yellow Pages, True Local, White Pages, Yelp, Hotfrog, StartLocal)
- Google Places stays as optional future source

### Regex-First Extraction (Not LLM)
- 90% of business emails found via regex/mailto/JSON-LD in <1 second
- LLM (ScrapeGraphAI) used ONLY as fallback for the ~10% where regex fails
- This makes the pipeline 10-50x faster than LLM-per-website

### Static Suburb JSON Files
- LocationExpansionService reads from `src/data/locations/{country}/{state}/{city}.json`
- No LLM calls to invent suburbs — fast, free, stable
- Each file contains: suburbs list, region keywords, state, country

### Website Cache
- File-based cache (JSON per domain) with 7-day TTL
- Before crawling: check cache → reuse if fresh → crawl if missing/expired
- Prevents re-scraping the same website across multiple queries/jobs

### Directory Rules
- Directories are DISCOVERY sources, not leads
- Directory page → extract business names + official websites → scrape those websites for emails
- Never save a directory URL as a lead
- Directory detection: multiple business names, listing/search URL patterns, known directory domains

### HardCaseExtractor Choice
- MVP: ScrapeGraphAI only (already wired up)
- Ollama added later only if API costs become a real issue
- Regex handles most cases; ScrapeGraphAI sees only messy pages

### Email Validation Order
1. Syntax validation (regex)
2. Bad placeholder block
3. Disposable email blocklist
4. MX record check (via dnspython, optional — skip if not installed)
5. Role email flag (info@, hello@ = valid but generic; noreply@ = block)
6. SMTP probe deferred to later (slow, unreliable)

### Query Rate Limiting
- 80 queries split into batches of 10
- 1-3 second random delay between batches
- Stop early when enough quality leads found (don't waste time)

## Service Files (all in `apps/worker/src/services/`)

| Service | File | Purpose |
|---------|------|---------|
| LocationExpansionService | `location_expansion_service.py` | Expand city → suburbs via static JSON |
| QueryPlannerService | `query_planner_service.py` | Generate ~80 search queries |
| QueryRateLimiter | `query_rate_limiter.py` | Batch queries with delays |
| URLClassifierService | `url_classifier_service.py` | Classify URLs as business/directory/bad |
| WebsiteCacheService | `website_cache_service.py` | Cache scraped data (7-day TTL) |
| CheapContactExtractor | `cheap_contact_extractor.py` | Regex/mailto/JSON-LD extraction |
| LeadQualityGate | `lead_quality_gate.py` | Validate + ICP score leads |
| LeadDiscoveryPipeline | `lead_discovery_pipeline.py` | Main orchestrator tying all services |

## Directory Sources Configured

### Australia
- Yellow Pages AU (`yellowpages.com.au`)
- True Local (`truelocal.com.au`)
- White Pages AU (`whitepages.com.au`)
- Yelp AU (`yelp.com.au`)

### US
- Yellow Pages US (`yellowpages.com`)
- White Pages US (`whitepages.com`)
- Yelp US (`yelp.com`)

### UK
- Yellow Pages UK (`yell.com`)
- Yelp UK (`yelp.co.uk`)

## ICP Score Computation

| Signal | Weight |
|--------|--------|
| Valid email | 0.15 |
| MX record valid | 0.10 |
| Non-role email | 0.05 |
| Has business name | 0.10 |
| Has phone | 0.10 |
| Has suburb | 0.05 |
| Industry match | 0.15 |
| Location match | 0.10 |
| Has services data | 0.10 |
| Extraction confidence × 0.10 | up to 0.10 |

Total range: 0.0 – 1.0

## Wiring Into Existing System

- New pipeline replaces `ScrapeGraphAgent.run_integrated_scrape()` in `command_workflow.py`
- Old flow kept for `MOCK_MODE=true` (testing)
- New flow activated when `MOCK_MODE=false`
- Pipeline emits same webhook events (`lead_found`, `agent_event`) so existing backend handlers work unchanged
- `_save_pipeline_lead()` helper emits `lead_found` event → existing `handleLeadFound()` processes dedupe + policy + save
