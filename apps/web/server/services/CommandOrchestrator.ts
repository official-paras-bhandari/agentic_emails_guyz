import { DomainGuardService } from './DomainGuardService';

export interface CommandPlan {
  commandType: string;
  steps: string[];
  allowed?: boolean;
}

export class CommandOrchestrator {
  private domainGuard: DomainGuardService;

  constructor() {
    this.domainGuard = new DomainGuardService();
  }

  async understandCommand(prompt: string): Promise<CommandPlan> {
    const guardResult = await this.domainGuard.classifyIntent(prompt);
    
    if (!guardResult.allowed) {
      return {
        commandType: 'OUT_OF_SCOPE',
        steps: [guardResult.message || "I’m focused on outreach tasks only."],
        allowed: false
      };
    }

    if (prompt.toLowerCase().includes('lead') || prompt.toLowerCase().includes('email')) {
      return {
        commandType: 'SCRAPE_AND_OUTREACH',
        steps: [
          "Search for relevant websites",
          "Extract emails using ScrapeGraphAI",
          "Clean and deduplicate leads",
          "Draft personalized outreach emails",
          "Wait for user approval"
        ],
        allowed: true
      };
    }

    return {
      commandType: 'UNKNOWN',
      steps: ["Analyze request", "Ask for clarification"],
      allowed: true
    };
  }

  async executePlan(plan: CommandPlan) {
    // This would trigger the background jobs/worker
    console.log(`Executing plan of type: ${plan.commandType}`);
  }
}
