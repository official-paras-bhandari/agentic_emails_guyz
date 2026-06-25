import { ContactPolicyService } from './ContactPolicyService';

/** Compatibility facade. All sending decisions are centralized in ContactPolicyService. */
export class SendRulesService {
  canSend(workspaceId: string, leadId: string, campaignId?: string) {
    return new ContactPolicyService().canSendNow(workspaceId, leadId, campaignId);
  }
}
