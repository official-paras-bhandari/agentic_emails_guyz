# Master Specification - Agentic Outreach

## Core User Experience
The app must not be a normal CRM first. It must be a chat-first agent workspace similar to ChatGPT, Kimi, and Claude. The user should mainly control the product by typing commands into a central chat interface.

The user opens the app and sees a clean AI workspace. On the left there is a sidebar with New Chat, Projects, Leads, Campaigns, Approvals, Follow-ups, Suppression List, Google Connect, Agent Swarm, Scraping Jobs, Artifacts, Settings, and Chat History. In the center there is a large chat input where the user can type commands like:
* “Find 50 Sydney salon leads and draft outreach emails.”
* “Send follow-up 2 to approved leads only.”
* “Export today’s leads to Google Sheets.”

## Tech Stack
* Next.js App Router for frontend and backend API
* Tailwind CSS + shadcn/ui for clean modern UI
* Supabase Postgres with Prisma ORM
* Python 3.12 worker service for AI agents
* ScrapeGraphAI for scraping and structured extraction
* Google OAuth for connecting the user’s Google account
* Gmail API for sending emails and reading replies
* Background jobs for scraping, drafting, sending, reply checking, and follow-ups

## Main Product Goal
A user should be able to type a command, and the system should understand it, create a plan, ask for confirmation if needed, run scraping agents using ScrapeGraphAI, collect public business information, deduplicate leads, save clean leads, write personalized email drafts, ask the user for approval, send emails using the connected Gmail account, track replies, schedule follow-ups, stop after 4 follow-ups, and permanently block unsubscribed leads.

## Important Architecture Rule
AI agents do the smart work, but backend rules make final decisions. AI agents must never be trusted for final send permission, duplicate enforcement, unsubscribe enforcement, or follow-up limits.

## AI Agents Required
1. **CommandUnderstandingAgent**: Reads the user’s chat prompt, converts it into a structured command plan.
2. **ScrapePlanningAgent**: Decides which sources to search, creates scraping tasks.
3. **ScrapeGraphAgent**: Uses ScrapeGraphAI to extract public business data from websites. Returns structured JSON only.
4. **LeadEnrichmentAgent**: Creates a useful business summary, finds personalization points, assigns lead quality score.
5. **DedupeAssistantAgent**: Helps identify possible duplicate leads. Backend DedupeService makes the final decision.
6. **EmailWriterAgent**: Writes first cold email and follow-ups 1-4. Uses business context.
7. **ReplyClassifierAgent**: Reads Gmail replies, classifies replies (interested, unsubscribe, bounce, etc).
8. **FollowUpAgent**: Plans next follow-up timing and copy.

## Backend Rule Engine (SendRulesService & DedupeService)
- **SendRulesService**: Checks user connected Gmail, lead valid email, user approved, lead not unsubscribed/suppressed/bounced/blocked, follow-up count < 4, daily limits not reached.
- **DedupeService**: Checks normalized email, domain, phone, business name + suburb, source URL, previous search jobs, Google Sheets.
- **Follow-up Rules**: Day 0, Day 3, Day 7, Day 14, Day 21 (Stop forever after). Never follow-up if replied, unsubscribed, bounced, limit reached.
- **Unsubscribe Rules**: MVP uses "reply unsubscribe". Add to suppression_entries, cancel follow-ups, block future sending.

## UI Requirements
- **Chat-first UI**: Left sidebar (New Chat, Command Center, Agent Swarm, Leads, Jobs, Campaigns, Approvals, Follow-ups, Suppression List, Connect, Artifacts, Settings). Big chat input. Progress cards, lead tables in chat, approval requests.
- **Job Progress UI**: Timeline of agent steps (Understanding -> Planning -> Scraping -> Validating -> Dedupe -> Saving -> Enriching -> Drafting -> Waiting Approval).
- **Agent Swarm UI**: Cards for all agents showing status, tasks, success count, logs.
- **Leads UI**: Table with filters, Search, detail panel showing scraped data, timeline, Gmail thread ID, replies.
- **Campaigns UI**: Group leads/emails, max follow-ups, limits, auto-follow-up toggle.
- **Approvals UI**: Review drafts before sending (approve, edit, skip, block).
- **Google Connect UI**: Set daily limits, delays, connect account, test sending.

## Security
- Encrypt Google refresh tokens.
- Never expose tokens to frontend.
- All database queries must be scoped by workspaceId.
- Audit logs for every send, block, unsubscribe, approval, failed send, duplicate skip, and follow-up.
- Validate all ScrapeGraphAI output with schemas.

## MVP Build Order
1. App shell with sidebar and chat interface
2. Auth and workspace
3. Chat sessions and messages
4. Command orchestrator
5. Job system and job timeline UI
6. Google OAuth connect
7. Gmail send test
8. Leads database
9. Manual lead creation
10. Dedupe service
11. Email draft generation
12. Approval queue
13. Send approved email via Gmail
14. Track sent email and Gmail thread ID
15. Reply sync
16. Unsubscribe detection
17. Suppression list
18. Follow-up task system
19. Stop after 4 follow-ups
20. ScrapeGraphAI worker integration
21. Lead scraping from public websites
22. Lead enrichment
23. Google Sheets export
24. Agent Swarm UI
25. Dashboard metrics
26. Artifacts/reports
