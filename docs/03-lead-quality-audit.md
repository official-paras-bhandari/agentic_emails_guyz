# Agentic Outreach — End-to-End Lead Quality & Speed Audit

**Date:** 2026-06-21  
**Scope:** Lead discovery → deduplication → enrichment → drafting → sending pipeline

---

## 1. Executive Summary

This is a well-architected, chat-first outreach CRM with a solid foundation: clear separation between AI agents (smart work) and deterministic backend rules (safety decisions), proper deduplication, suppression enforcement, and a Gmail-based send pipeline. However, there are **significant gaps in lead quality scoring, enrichment depth, and scraping throughput** that directly impact how fast you can find leads and how good those leads are.

**Biggest opportunities (ranked by impact):**
1. No real lead quality scoring — `qualityScore` column exists but is never computed
2. Enrichment is shallow — only stores raw services text, no actionable personalization
3. Scraping throughput is bottlenecked by sequential SmartScraperGraph calls per business
4. No email verification — bounces will hurt sender reputation
5. Directory fallbacks are limited to 3 countries and ignore high-quality paid sources

---

## 2. Current Architecture Overview

### 2.1 Lead Discovery Flow
```
User prompt → CommandUnderstandingAgent → ScrapeGraphAgent
  → DuckDuckGo search → SmartScraperGraph on each URL
  → Extract (email, business_name, phone, suburb, address, services)
  → Location filter → Webhook to backend
  → Policy check → Dedupe check → Save lead + enrichment
  → EmailWriterAgent drafts email → Approval queue
```

### 2.2 Data Model (Lead-related)
- **Lead**: email, businessName, website, normalizedDomain, phone, normalizedPhone, suburb, status, qualityScore (nullable, never set)
- **LeadSource**: URL, type, extractionLocation, scrapedAt, confidenceScore, extractedFields
- **LeadEnrichment**: summary, personalization (nullable), data (JSON)
- **LeadMemory**: AI-generated memories per lead
- **Reply**: classification, content, thread tracking

### 2.3 Safety Layers (✅ Strong)
- DedupeService: email, domain, phone, business+suburb, source URL
- ContactPolicyService: suppression, bounce, block, reply, cooldown checks
- SendRulesService: daily limits, follow-up caps, Gmail connectivity
- Webhook HMAC signatures, request scoping by workspaceId

---

## 3. Detailed Audit — Lead Quality

### 3.1 CRITICAL: Quality Score Is Never Computed

**Problem:** The `Lead.qualityScore` column exists in the database but is **never populated** with a real value. The UI displays `qualityScore: 0` hardcoded (`apps/web/app/api/jobs/[jobId]/route.ts:60`).

**Impact:** You cannot prioritize leads, filter by quality, or auto-approve high-quality drafts.

**Fix:**
```
Add a LeadQualityService that scores each lead on:
- Email presence & role (info@, hello@ = +0.1, personal name@ = +0.2)
- Website quality (has contact page = +0.1, has booking form = +0.15)
- Data completeness (phone + email + suburb = +0.15)
- Business type match (industry keyword in services = +0.1)
- Source reliability (direct website = +0.2, directory = +0.1)
- Location confidence (exact suburb match = +0.1)
Score range: 0.0–1.0, computed at save time in handleLeadFound()
```

### 3.2 Enrichment Is Too Shallow

**Problem:** `LeadEnrichment` only stores a one-line services summary. The `personalization` field is always `null`. No competitor analysis, no pain-point identification, no website quality assessment.

**Impact:** Email drafts are generic ("I came across your website") because there's nothing specific to personalize with.

**Fix:**
```
Expand enrichment to extract:
- Website tech stack (booking system, CMS, analytics)
- Social proof (reviews, testimonials count)
- Competitive gap (missing services compared to industry standard)
- Recent changes (new location, new services — via Wayback Machine diff)
- Personalization hooks: owner name, years in business, awards, local community ties
- Pain signals: no online booking, no email on site, outdated design
Store as structured JSON, not just text summary.
```

### 3.3 No Email Verification Before Saving

**Problem:** Emails are accepted as-is from website scraping. No SMTP validation, no MX record check, no disposable email detection.

**Impact:** Invalid emails → Gmail bounces → sender reputation damage → deliverability drops for all future emails.

**Fix:**
```
Add pre-save email validation:
1. Syntax check (already done via regex in clean_email())
2. MX record lookup (dns.resolver in Python)
3. SMTP mailbox probe (connect to mail server, RCPT TO, then QUIT — no send)
4. Disposable domain blocklist (mailinator, guerrillamail, etc.)
5. Role-based email flag (info@, sales@, admin@ — lower quality but acceptable)

Reject leads with invalid MX or known disposable domains.
Flag role-based emails for lower quality score.
```

### 3.4 Location Filtering Is Keyword-Based, Not Semantic

**Problem:** `_location_matches()` splits the target location into words and checks substring containment. This misses synonyms, nearby suburbs, and metro area coverage.

**Example:** Target "inner west Sydney" won't match "Leichhardt" even though it's a core inner-west suburb.

**Fix:**
```
Option A (fast): Maintain a suburb-to-region mapping file (JSON)
  → "inner west sydney" → ["Leichhardt", "Newtown", "Balmain", ...]
  → Match if listing suburb is in the expanded region list

Option B (accurate): Use geocoding API (Google Maps, OpenStreetMap)
  → Convert target location to lat/lng + radius
  → Convert listing address to lat/lng
  → Calculate distance, accept if within radius

Option C (LLM-based): Ask the LLM "Is {suburb} part of {target_location}?"
  → Slower but handles edge cases well
  → Cache results to avoid repeated calls
```

---

## 4. Detailed Audit — Scraping Speed

### 4.1 CRITICAL: Sequential SmartScraperGraph Per Business

**Problem:** In `_run_directory_scrape()`, each business website is scraped with a separate `SmartScraperGraph` call. While `ThreadPoolExecutor` provides concurrency, each call still:
1. Spins up a headless browser
2. Loads the full page
3. Sends page content to LLM for extraction
4. Waits for LLM response

With `SCRAPE_CONCURRENCY=2` (default), you're processing 2 sites at a time. For 50 leads, that's 25 sequential batches. Each SmartScraperGraph call takes 15-45 seconds. **Total time: 6-18 minutes for 50 leads.**

**Fix:**
```
Option A (immediate): Increase SCRAPE_CONCURRENCY to 5-8
  → Requires more RAM (each browser ~200MB)
  → Monitor for rate limiting from target sites

Option B (structural): Batch-extract emails from multiple sites in one LLM call
  → Fetch HTML from 5-10 sites in parallel (no LLM)
  → Send all HTML snippets to LLM in one prompt:
    "Extract emails from these 5 websites. Return JSON array."
  → Reduces LLM API calls by 5-10x

Option C (fastest for scale): Replace SmartScraperGraph with regex + pattern matching
  → 90% of business emails are found via: mailto: links, /contact page regex
  → Run regex first, fall back to LLM only when regex fails
  → Speed improvement: 10-50x for simple cases
  → LLM fallback for complex layouts, JavaScript-rendered pages
```

### 4.2 No Caching of Previously Scraped Websites

**Problem:** If you search for "salons in Sydney" today and "hair salons in Sydney" tomorrow, the same websites get scraped again. No content cache exists.

**Fix:**
```
Add a WebsiteContentCache table:
  - url (unique)
  - last_scraped_at
  - html_snapshot (compressed)
  - extracted_email
  - extracted_fields (JSON)

Before scraping, check cache. If < 7 days old, reuse cached data.
Invalidates when user requests fresh scrape or cache expires.
```

### 4.3 DuckDuckGo Search Returns Limited Results

**Problem:** DDGS typically returns 10-20 results per query. With `MAX_SITES_PER_JOB=10` and `IGNORED_DOMAINS` filtering out directories, you often get only 3-5 actual business websites per search batch.

**Fix:**
```
1. Add Google Custom Search API as primary (100 results/day free, then paid)
2. Add Bing Web Search API as secondary
3. Implement query variation automatically:
   - "salon owners Sydney"
   - "hair salon Sydney contact"
   - "best salons in Sydney"
   - "Sydney salon email"
4. Rotate search engines per attempt to maximize unique results
5. Add SERP pagination (Google supports page=2, page=3, etc.)
```

### 4.4 MAX_SITES_PER_JOB Cap Is Too Low for Speed

**Problem:** `MAX_SITES_PER_JOB` defaults to 10. Even if the user requests 50 leads, the job caps at 10 sites per batch.

**Fix:**
```
Make it dynamic based on user request:
- User asks for 5 → MAX_SITES_PER_JOB = 10 (2x buffer for dupes)
- User asks for 50 → MAX_SITES_PER_JOB = 100 (2x buffer)
- Hard cap at 100 to prevent runaway scraping
- Add per-workspace daily scrape limit to control costs
```

---

## 5. Detailed Audit — Lead Sources & Coverage

### 5.1 Limited Directory Fallbacks

**Current:** Only Yellow Pages, True Local, White Pages, Yelp for AU/US/UK.

**Missing high-value sources:**
```
- Google Business Profile (highest accuracy for local businesses)
- LinkedIn (B2B leads, decision-maker names)
- Industry-specific directories (e.g., Fresha for salons, Houzz for contractors)
- Facebook Business pages (many small businesses have FB but no website)
- Instagram business profiles
- Chamber of Commerce listings
- Yelp (exists but only as fallback, should be primary for US)
- Crunchbase / AngelList (for startup/tech leads)
- Government business registries (ABN lookup in Australia)
```

**Recommendation:**
```
Implement a SourcePriorityService that ranks sources by industry + location:
- Salons/Beauty: Fresha → Google Maps → Yelp → Yellow Pages
- Contractors: Houzz → Google Maps → Yelp → Facebook
- Professional Services: LinkedIn → Google Maps → Industry directory
- Restaurants: Google Maps → Yelp → TripAdvisor → Facebook
```

### 5.2 No LinkedIn Integration

**Problem:** LinkedIn is the #1 source for B2B leads with decision-maker names, company size, revenue, and tech stack. It's in `IGNORED_DOMAINS` so it's actively excluded.

**Fix:**
```
Add LinkedIn as a special-case source:
1. Use LinkedIn Sales Navigator API (paid) or
2. Use a scraping service with proper rate limiting or
3. Manual LinkedIn URL enrichment:
   - Search "{business_name} {location} site:linkedin.com/company"
   - Extract company page URL
   - Get employee count, industry, company description
   - Search for owner/manager: "{business_name} founder site:linkedin.com/in"
```

### 5.3 No Google Maps Integration Despite Being Configured

**Problem:** `SCRAPE_SOURCE` supports `google_maps` but `_build_directory_url()` returns an empty string for it, and the fallback logic never uses it. Google Maps has the most accurate, up-to-date local business data.

**Fix:**
```
Implement Google Maps scraping:
- Use the googlemaps Python package (official API, free tier: $200/month credit)
- Search: Places API → textSearch with "{industry} in {location}"
- Returns: name, address, phone, website, rating, review count, business status
- Much higher accuracy than web search
- Add as primary source for local businesses
```

---

## 6. Detailed Audit — Email Draft Quality

### 6.1 Personalization Points Are Not Extracted

**Problem:** The `EmailWriterAgent` receives `lead_context` with business name, suburb, and services — but the enrichment data is minimal. The agent has nothing specific to write about.

**Current output pattern:**
```
"I came across your public business website{context} and wanted to ask whether
improving your booking and customer follow-up workflow is currently a priority."
```

This is the same email for every salon, every location.

**Fix:**
```
Require enrichment to produce 3+ personalization hooks before drafting:
1. Something specific about their business ("I noticed you offer balayage...")
2. A pain point or gap ("Your website doesn't show online booking...")
3. A local reference ("As a business in Campsie, you're in a growing area...")

If < 2 hooks found, flag draft as "needs more research" and skip auto-draft.
```

### 6.2 No A/B Testing or Performance Tracking

**Problem:** There's no system to track which email templates, subject lines, or personalization approaches get the best reply rates.

**Fix:**
```
Add reply_rate tracking per:
- Subject line pattern (question vs. statement vs. value prop)
- Personalization depth (name-only vs. business-specific vs. pain-point)
- Send time (morning vs. afternoon vs. evening)
- Industry vertical

Use OutcomeMemory to store these metrics.
After 50+ sends, auto-suggest the best-performing patterns.
```

### 6.3 AutoVerificationAgent Has No Enforcement

**Problem:** The `AutoVerificationAgent` evaluates drafts and returns `requires_human_review: true/false`, but the workflow doesn't act on this. All drafts go to the approval queue regardless.

**Fix:**
```
Implement tiered approval:
- Score >= 0.9: Auto-send (no human review needed)
- Score 0.7-0.89: Queue for approval (current behavior)
- Score < 0.7: Reject draft, flag lead for manual review

Configurable per campaign via campaign.autoVerifyThreshold (already in schema!)
```

---

## 7. Detailed Audit — Infrastructure & Reliability

### 7.1 No Retry Logic for Failed Scraping

**Problem:** If `SmartScraperGraph` fails on a URL (timeout, site blocked, JavaScript-heavy page), the lead is lost. No retry with different approach.

**Fix:**
```
Implement a 3-tier fallback per URL:
1. SmartScraperGraph (LLM extraction)
2. Regex-only extraction (fast, covers 60% of cases)
3. Google Cache / Wayback Machine snapshot (for blocked sites)
```

### 7.2 No Rate Limiting on Outbound Scraping

**Problem:** With `SCRAPE_CONCURRENCY` and no per-domain rate limiting, you could hit the same website multiple times in rapid succession, triggering bot detection.

**Fix:**
```
Add per-domain rate limiter:
- Max 1 request per domain per 3 seconds
- Exponential backoff on 429/403 responses
- User-Agent rotation
- Respect robots.txt
```

### 7.3 Mock Mode Defaults to True

**Problem:** `MOCK_MODE` defaults to `"true"` in config. New users will never see real results unless they explicitly change this.

**Fix:**
```
Change default to "false" with a clear error message if LLM API key is missing:
"MOCK_MODE is disabled but no LLM API key is configured. 
Set ACTIVE_MODEL and the corresponding API_KEY, or set MOCK_MODE=true for testing."
```

---

## 8. Priority Action Plan

### Phase 1: Quick Wins (1-2 weeks)
| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | Compute and populate `qualityScore` on lead save | High | Low |
| 2 | Add MX record + SMTP email validation | High | Low |
| 3 | Increase default `SCRAPE_CONCURRENCY` to 5 | Medium | Trivial |
| 4 | Make `MAX_SITES_PER_JOB` dynamic based on requested quantity | Medium | Low |
| 5 | Implement AutoVerificationAgent enforcement (auto-send threshold) | High | Low |
| 6 | Add regex-first email extraction with LLM fallback | High | Medium |

### Phase 2: Quality Improvements (2-4 weeks)
| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 7 | Deep enrichment: tech stack, pain points, personalization hooks | High | Medium |
| 8 | Google Places API integration for local businesses | High | Medium |
| 9 | Suburb-to-region mapping for semantic location matching | Medium | Low |
| 10 | Website content caching to avoid re-scraping | Medium | Medium |
| 11 | Multi-search-engine rotation (DDGS + Google + Bing) | Medium | Medium |
| 12 | A/B test tracking for email performance | Medium | Medium |

### Phase 3: Scale & Coverage (4-8 weeks)
| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 13 | LinkedIn integration for B2B leads | High | High |
| 14 | Industry-specific source prioritization | High | Medium |
| 15 | Per-domain rate limiting and bot-detection evasion | Medium | Medium |
| 16 | Batch LLM extraction (multiple sites per prompt) | High | Medium |
| 17 | 3-tier URL scraping fallback (LLM → regex → cache) | High | High |
| 18 | Automated query variation and SERP pagination | Medium | Medium |

---

## 9. Quality Metrics to Track

After implementing these changes, track:

| Metric | Current | Target (Phase 1) | Target (Phase 3) |
|--------|---------|-----------------|------------------|
| Leads found per 50 requested | ~10-20 | 30-40 | 45-50 |
| Time to 50 leads | 6-18 min | 3-5 min | 1-2 min |
| Email bounce rate | Unknown | < 5% | < 2% |
| Lead quality score (avg) | 0 (not computed) | 0.6+ | 0.8+ |
| Draft approval rate | Unknown | 70%+ | 90%+ |
| Reply rate (cold email) | Unknown | 5%+ | 10%+ |
| Duplicate rate | Unknown | < 15% | < 5% |

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Google Places API costs exceed budget | Medium | Medium | Set daily quota, use free tier first |
| Scraping triggers IP blocks | High | High | Rotate proxies, respect rate limits, use official APIs where possible |
| Gmail sending limits reached | Medium | High | Stagger sends, respect daily limits, use multiple sender accounts |
| LLM costs scale with batch extraction | Medium | Medium | Cache LLM responses, use cheaper models for extraction |
| Quality scores become gaming metric | Low | Medium | Regular audit, combine with actual reply rates |

---

## 11. Conclusion

The architecture is **solid and well-designed** — the separation of AI agents from deterministic rules is the right call, and the safety model (dedupe, suppression, policy checks) is production-ready.

The **biggest gap** is that lead quality is assumed but never measured, computed, or optimized. The scraping pipeline works but is slow due to sequential LLM calls per website. Fix the quality scoring, add email verification, increase concurrency, and implement regex-first extraction — and you'll see a 3-5x improvement in both speed and quality within 2 weeks.
