# Agentic Outreach - Product Architecture & Rules

## Main Product Goal
A ChatGPT-style AI Outreach CRM where the user controls the product by typing commands. The system handles scraping, deduplication, personalized drafting, approvals, Gmail sending, reply tracking, and scheduled follow-ups.

## Architecture Rules
- **Frontend/Backend:** Next.js App Router (TypeScript), Tailwind CSS, shadcn/ui.
- **Database:** Supabase Postgres + Prisma ORM.
- **Worker:** Python 3.12 for AI Agents and workflows.
- **Scraping:** ScrapeGraphAI (Integrated Planning & Scraping).
- **Email:** Google OAuth + Gmail API only.
- **Domain Guardrail:** Strict enforcement of outreach-only tasks. The system uses `DomainGuardService` to reject unrelated requests (coding, recipes, etc.) at the API layer before calling worker agents.
- **Rule Engine:** Backend Node.js services (DedupeService, SendRulesService, FollowUpService) enforce the final rules (duplicates, unsubscribes, limits). Deduplication is handled deterministically in the backend, not by AI agents, to ensure reliability and lower cost.

## Core Workflows
1. **Command Understanding:** Chat input → `CommandUnderstandingAgent` → structured plan → user approval.
2. **Integrated Scraping:** `ScrapeGraphAgent` handles both website discovery and data extraction (returning structured JSON).
3. **Enrichment & Dedupe:** `LeadEnrichmentAgent` → backend `DedupeService` (deterministic matching).
4. **Drafting:** `EmailWriterAgent` → user approves drafts in the UI.
5. **Sending & Follow-up:** Gmail API dispatch → `ReplyClassifierAgent` → scheduled follow-ups (max 4).

## UI/UX Strategy
- **Chat-First Experience:** The sidebar is minimized; all primary actions (scraping, finding, drafting) happen inside the chat workspace.
- **Live Agent Feedback:** Use animations and live "Agent Status" cards in the chat to show real-time progress, such as which website the agent is currently visiting or extracting data from.
- **No Redundant Nav:** Remove separate sidebars for "Lead Finding" or "Scraping" to keep the user focused on the command-driven flow.

## Security & Compliance
- Encrypt Google refresh tokens; never expose to frontend.
- Database queries scoped by workspaceId.
- Audit logs required for every send, block, unsubscribe, approval, duplicate skip, and follow-up.
- Validate ScrapeGraphAI output against strict schemas.
