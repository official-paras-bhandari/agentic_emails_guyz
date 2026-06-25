import { OpenAI } from 'openai';

export type OutreachIntent = 
  | 'scrape_leads'
  | 'find_businesses'
  | 'enrich_leads'
  | 'draft_emails'
  | 'rewrite_emails'
  | 'verify_drafts'
  | 'send_emails'
  | 'run_followups'
  | 'check_replies'
  | 'unsubscribe_or_block'
  | 'export_leads'
  | 'show_status'
  | 'show_campaigns'
  | 'show_memory'
  | 'show_audit'
  | 'out_of_scope';

export interface DomainGuardResult {
  allowed: boolean;
  intent: OutreachIntent;
  message?: string;
}

export class DomainGuardService {
  private openai: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY && process.env.MOCK_MODE !== 'true') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
  }

  async classifyIntent(message: string): Promise<DomainGuardResult> {
    let cleanMessage = message.trim();
    if (cleanMessage.startsWith('"') && cleanMessage.endsWith('"')) {
      cleanMessage = cleanMessage.slice(1, -1).trim();
    }
    if (cleanMessage.startsWith("'") && cleanMessage.endsWith("'")) {
      cleanMessage = cleanMessage.slice(1, -1).trim();
    }

    // If we are in mock mode or no API key is provided, use simple keyword matching
    if (!this.openai || process.env.MOCK_MODE === 'true') {
      return this.mockClassify(cleanMessage);
    }

    const systemPrompt = `
You are a domain guardrail for an AI Outreach CRM. Your job is to classify if a user's request is related to business outreach and lead generation or if it's out of scope.

IMPORTANT PROMPT PATTERNS TO ALLOW:
- Requests starting with "Lead discovery for: " or "Mission: " (e.g. "Lead discovery for: get mail from salons") are ALLOWED.
- Requests asking to "get mail from [industry]", "get email addresses of [industry]", or "gather emails of [industry]" refer to scraping public contact information and are ALLOWED.

ALLOWED DOMAINS:
- Find leads, search businesses, scrape public business websites.
- Extract public emails, phone numbers, websites, suburbs, and source URLs.
- Use ScrapeGraphAI for structured extraction.
- Deduplicate leads, enrich lead context.
- Write outreach emails, rewrite emails, generate follow-ups.
- Verify email quality.
- Send approved emails through Gmail.
- Check replies, detect unsubscribe replies, stop follow-ups.
- Export leads to Google Sheets.
- Show campaign performance, show job status, show agent logs.
- Use memory about my business, leads, campaigns, and past outcomes.

BLOCKED DOMAINS:
- General coding help, homework, recipes, jokes, politics, medical/legal advice, image generation, unrelated business planning, general ChatGPT conversation, anything not connected to outreach workflow.

ALLOWED INTENTS:
- scrape_leads, find_businesses, enrich_leads, draft_emails, rewrite_emails, verify_drafts, send_emails, run_followups, check_replies, unsubscribe_or_block, export_leads, show_status, show_campaigns, show_memory, show_audit.

BLOCKED INTENT:
- out_of_scope

RESPONSE FORMAT (JSON):
{
  "allowed": boolean,
  "intent": "intent_name",
  "message": "Optional message for out_of_scope"
}

If the user asks an unrelated request, set allowed=false, intent="out_of_scope", and message="I’m focused on outreach tasks only. I can help you find leads, scrape public business contact info, write emails, manage follow-ups, check replies, and track campaigns."
    `.trim();

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: cleanMessage }
        ],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return {
        allowed: result.allowed ?? false,
        intent: result.intent ?? 'out_of_scope',
        message: result.message
      };
    } catch (error) {
      console.error('DomainGuard LLM Error:', error);
      // Fallback to mock on error
      return this.mockClassify(message);
    }
  }

  private mockClassify(message: string): DomainGuardResult {
    const lower = message.toLowerCase();
    
    // Explicitly blocked items for mock
    const blockedKeywords = ['recipe', 'code', 'game', 'homework', 'joke', 'capital of', 'politics', 'medical', 'legal', 'image', 'build me'];
    if (blockedKeywords.some(word => lower.includes(word))) {
      return { 
        allowed: false, 
        intent: 'out_of_scope', 
        message: 'I’m focused on outreach tasks only. I can help you find leads, scrape public business contact info, write emails, manage follow-ups, check replies, and track campaigns.' 
      };
    }

    const keywords: Record<OutreachIntent, string[]> = {
      scrape_leads: ['find', 'scrape', 'leads', 'business', 'salon', 'plumber', 'prospect'],
      find_businesses: ['search', 'companies'],
      enrich_leads: ['enrich', 'context', 'info'],
      draft_emails: ['draft', 'write email'],
      rewrite_emails: ['rewrite', 'shorter', 'longer', 'tone', 'make these'],
      verify_drafts: ['verify', 'quality', 'check email'],
      send_emails: ['send', 'gmail', 'dispatch'],
      run_followups: ['followup', 'follow-up', 'sequence'],
      check_replies: ['replies', 'responses', 'inbox'],
      unsubscribe_or_block: ['unsubscribe', 'stop', 'block', 'remove'],
      export_leads: ['export', 'google sheets', 'csv'],
      show_status: ['status', 'job', 'logs'],
      show_campaigns: ['performance', 'campaigns', 'stats'],
      show_memory: ['memory', 'past', 'history'],
      show_audit: ['audit', 'logs'],
      out_of_scope: []
    };

    for (const [intent, words] of Object.entries(keywords)) {
      if (intent === 'out_of_scope') continue;
      if (words.some(word => lower.includes(word))) {
        return { allowed: true, intent: intent as OutreachIntent };
      }
    }

    // Default to out_of_scope if it doesn't match anything
    return { 
      allowed: false, 
      intent: 'out_of_scope', 
      message: 'I’m focused on outreach tasks only. I can help you find leads, scrape public business contact info, write emails, manage follow-ups, check replies, and track campaigns.' 
    };
  }
}
