export type OutreachIntent = "scrape_leads" | "find_businesses";

export interface CommandParameters {
  industry?: string;
  location?: string;
  quantity?: number;
}

export interface CommandPlan {
  allowed: boolean;
  goal: string;
  intent: OutreachIntent;
  parameters: CommandParameters;
  intent_flags?: {
    drafting_requested?: boolean;
  };
  rejection_reason?: string;
}
