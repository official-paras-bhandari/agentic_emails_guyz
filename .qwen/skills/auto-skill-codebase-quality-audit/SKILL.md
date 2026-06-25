---
name: codebase-quality-audit
description: Systematic methodology for auditing a codebase for quality, performance, and correctness gaps by tracing data flow end-to-end and comparing intended behavior (specs/schema) against actual implementation.
source: auto-skill
extracted_at: '2026-06-21T10:10:26.299Z'
---

# Codebase Quality Audit Methodology

## When to Use
When asked to audit, review, or assess a codebase for quality, performance, security, or any specific attribute (e.g., "how do we make leads faster/better?", "find bugs", "review architecture").

## Step-by-Step Approach

### 1. Understand Intent
- Read spec documents, README, and architecture docs first
- Identify the stated goals and data model
- Note what the system is *supposed* to do

### 2. Map the Data Flow
- Trace the critical path from user input → processing → output
- Read entry points (API routes, webhook handlers, CLI commands)
- Follow data through each layer: agents → services → database → response
- Identify where data is transformed, validated, or rejected

### 3. Compare Schema vs Implementation
- Read the database schema (Prisma, SQL, ORM models)
- For each field/table, grep for where it is **written** (not just read)
- Flag fields that exist but are never populated (dead columns)
- Flag fields that are always hardcoded vs dynamically computed

### 4. Find Performance Bottlenecks
- Look for sequential operations that could be parallel
- Check concurrency settings and their defaults
- Count API calls per operation (each LLM call = cost + latency)
- Identify missing caches for repeated work

### 5. Check Error Handling & Fallbacks
- What happens when an external API fails?
- Are there retries? How many?
- Are there graceful fallbacks or silent failures?
- Are rate limits respected?

### 6. Validate Safety & Security
- Read policy/enforcement services
- Check for: deduplication, suppression, rate limiting, authentication
- Verify that AI decisions are gated by deterministic rules
- Check for injection vulnerabilities, token exposure

### 7. Synthesize Findings
Structure the audit report as:
1. **Executive Summary** — top 3-5 findings ranked by impact
2. **Architecture Overview** — how the system works (data flow diagram)
3. **Detailed Findings** — per category (quality, speed, reliability, security)
   - For each: Problem → Impact → Fix
4. **Priority Action Plan** — phased table with Impact/Effort
5. **Metrics to Track** — current vs target values
6. **Risk Assessment** — likelihood/impact/mitigation

## Key Patterns to Look For

| Pattern | What It Indicates |
|---------|------------------|
| Column exists but never written | Dead feature or incomplete implementation |
| Hardcoded values in production code | Configuration that should be dynamic |
| Single-threaded loops over API calls | Performance bottleneck |
| AI output used without validation | Safety risk |
| No caching for expensive operations | Wasted resources |
| Default configs too conservative | Unnecessary speed/cost limits |
| Missing email/URL validation | Data quality issues |
| No A/B testing or metrics | Cannot optimize what you don't measure |

## Anti-Patterns to Avoid
- Don't audit everything equally — focus on the user's stated concern
- Don't recommend changes without reading the current implementation first
- Don't assume a feature works because the code exists — verify it's actually called
- Don't ignore the schema — it reveals intended vs actual behavior gaps
