# Agent Architecture - The "Army" (Revised)

## The Lean Agent Swarm
We use a focused group of agents to minimize costs and maximize speed.

1. **🧠 CommandUnderstandingAgent**: 
   - **Role**: The Entry Point. 
   - **Input**: User raw text prompt.
   - **Output**: A structured `CommandPlan` (JSON).

2. **🚜 ScrapeGraphAgent (Power Harvester)**: 
   - **Role**: Discovery & Extraction. 
   - **Action**: Takes the plan, searches the web, selects the best URLs, and uses ScrapeGraphAI to pull structured leads.
   - **UX**: Emits live "Visiting..." events for UI animations.

3. **🔍 LeadEnrichmentAgent**: 
   - **Role**: Personalization Specialist.
   - **Action**: Scans individual lead websites/socials to find custom "icebreakers".

4. **✍️ EmailWriterAgent**: 
   - **Role**: Creative Writer.
   - **Action**: Blends enrichment data with campaign goals to create high-converting drafts.

5. **📥 ReplyClassifierAgent**: 
   - **Role**: Inbox Manager.
   - **Action**: Classifies replies (Interested, Unsubscribe, etc.) via Gmail API.

6. **⏰ FollowupAgent**: 
   - **Role**: Consistency Manager.
   - **Action**: Schedules and manages the follow-up loop.

## Backend Rule Engine (No-AI Layer)
To ensure 100% compliance and zero waste, deterministic logic is handled by Node.js services:
- **DedupeService**: Prevents double-emailing leads already in the database.
- **SuppressionService**: Hard-blocks anyone who has unsubscribed.
- **SendRulesService**: Enforces daily limits and workspace-specific delays.

## Live Progress System
Agents report their state via a websocket/webhook bridge:
- `status`: 'searching', 'scraping', 'visiting', 'extracting'
- `current_url`: The website being touched
- `results_count`: Incremental lead count
