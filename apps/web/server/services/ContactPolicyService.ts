import { prisma } from '@packages/db';
import { AuditLogService } from './AuditLogService';
import { normalizeDomain, normalizeEmail } from '../security/request';

const audit = new AuditLogService();

export type ContactBlockReason =
  | 'already_in_campaign' | 'draft_already_exists' | 'send_already_queued'
  | 'already_sent_recently' | 'followup_already_scheduled' | 'active_campaign_collision'
  | 'campaign_active'
  | 'lead_replied' | 'lead_unsubscribed' | 'email_suppressed' | 'domain_suppressed'
  | 'lead_bounced' | 'lead_blocked' | 'lead_has_no_email' | 'negative_reply_cooldown'
  | 'completed_campaign_cooldown' | 'campaign_paused_or_cancelled' | 'daily_limit_reached'
  | 'gmail_disconnected' | 'max_followups_reached' | 'lead_not_found';

export type PolicyResult = { allowed: boolean; reason?: ContactBlockReason; details?: string };
type SendPolicyOptions = { isFollowUp?: boolean };

export class ContactPolicyService {
  async getFullLeadStatus(workspaceId: string, leadId: string) {
    return prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: {
        campaignLeads: { include: { campaign: true } },
        drafts: { include: { sendQueue: true } },
        sentEmails: { orderBy: { sentAt: 'desc' } },
        replies: { orderBy: { receivedAt: 'desc' } },
        followUpTasks: { orderBy: { stepNumber: 'desc' } },
      },
    });
  }

  async checkAbsoluteBlocks(workspaceId: string, lead: { email?: string | null; website?: string | null; status: string; replies?: { classification: string }[] }): Promise<PolicyResult> {
    if (lead.status === 'unsubscribed') return { allowed: false, reason: 'lead_unsubscribed' };
    if (lead.status === 'blocked') return { allowed: false, reason: 'lead_blocked' };
    if (lead.status === 'bounced') return { allowed: false, reason: 'lead_bounced' };
    const email = normalizeEmail(lead.email);
    const domain = normalizeDomain(lead.website);
    const clauses = [...(email ? [{ email }] : []), ...(domain ? [{ domain }] : [])];
    if (clauses.length) {
      const suppression = await prisma.suppressionEntry.findFirst({ where: { workspaceId, OR: clauses } });
      if (suppression) return { allowed: false, reason: suppression.email ? 'email_suppressed' : 'domain_suppressed' };
    }
    const reply = lead.replies?.[0];
    if (reply?.classification === 'unsubscribe') return { allowed: false, reason: 'lead_unsubscribed' };
    return { allowed: true };
  }

  async canDiscoverLead(workspaceId: string, data: { email?: string | null; website?: string | null }): Promise<PolicyResult> {
    const email = normalizeEmail(data.email);
    const domain = normalizeDomain(data.website);
    const clauses = [...(email ? [{ email }] : []), ...(domain ? [{ domain }] : [])];
    if (!clauses.length) return { allowed: true };
    const suppression = await prisma.suppressionEntry.findFirst({ where: { workspaceId, OR: clauses } });
    if (!suppression) return { allowed: true };
    return { allowed: false, reason: suppression.email ? 'email_suppressed' : 'domain_suppressed' };
  }

  async canAddToCampaign(workspaceId: string, leadId: string, campaignId: string): Promise<PolicyResult> {
    const lead = await this.getFullLeadStatus(workspaceId, leadId);
    if (!lead) return { allowed: false, reason: 'lead_not_found' };
    const absolute = await this.checkAbsoluteBlocks(workspaceId, lead);
    if (!absolute.allowed) return absolute;
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
    if (!campaign || !['draft', 'active', 'paused'].includes(campaign.status)) return { allowed: false, reason: 'campaign_paused_or_cancelled' };
    if (campaign.status === 'active') return { allowed: false, reason: 'campaign_active' };
    if (lead.campaignLeads.some(item => item.campaignId === campaignId)) return { allowed: false, reason: 'already_in_campaign' };
    if (lead.campaignLeads.some(item => item.campaignId !== campaignId && item.status === 'active' && item.campaign.status === 'active')) {
      return { allowed: false, reason: 'active_campaign_collision' };
    }
    return this.canReEngageLater(workspaceId, leadId);
  }

  async canDraftEmail(workspaceId: string, leadId: string, campaignId?: string): Promise<PolicyResult> {
    const lead = await this.getFullLeadStatus(workspaceId, leadId);
    if (!lead) return { allowed: false, reason: 'lead_not_found' };
    if (!normalizeEmail(lead.email)) return { allowed: false, reason: 'lead_has_no_email' };
    const absolute = await this.checkAbsoluteBlocks(workspaceId, lead);
    if (!absolute.allowed) return absolute;
    if (lead.replies.length) return { allowed: false, reason: 'lead_replied' };
    if (lead.drafts.some(draft => !['cancelled', 'skipped', 'failed', 'sent'].includes(draft.status))) return { allowed: false, reason: 'draft_already_exists' };
    if (campaignId) {
      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
      if (!campaign || !['draft', 'active'].includes(campaign.status)) return { allowed: false, reason: 'campaign_paused_or_cancelled' };
    }
    return { allowed: true };
  }

  async canQueueSend(workspaceId: string, leadId: string, campaignId?: string): Promise<PolicyResult> {
    const lead = await this.getFullLeadStatus(workspaceId, leadId);
    if (!lead) return { allowed: false, reason: 'lead_not_found' };
    const absolute = await this.checkAbsoluteBlocks(workspaceId, lead);
    if (!absolute.allowed) return absolute;
    if (!normalizeEmail(lead.email)) return { allowed: false, reason: 'lead_has_no_email' };
    if (lead.drafts.some(draft => draft.sendQueue && ['pending', 'checking_rules', 'queued', 'sending'].includes(draft.sendQueue.status))) {
      return { allowed: false, reason: 'send_already_queued' };
    }
    if (campaignId) {
      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
      if (!campaign || campaign.status !== 'active') return { allowed: false, reason: 'campaign_paused_or_cancelled' };
    }
    return { allowed: true };
  }

  async canSendNow(workspaceId: string, leadId: string, campaignId?: string, options: SendPolicyOptions = {}): Promise<PolicyResult> {
    const lead = await this.getFullLeadStatus(workspaceId, leadId);
    if (!lead) return { allowed: false, reason: 'lead_not_found' };
    const block = await this.checkAbsoluteBlocks(workspaceId, lead);
    if (!block.allowed) return this.block(workspaceId, leadId, block.reason!, campaignId);
    if (!normalizeEmail(lead.email)) return this.block(workspaceId, leadId, 'lead_has_no_email', campaignId);
    if (lead.replies.length) return this.block(workspaceId, leadId, 'lead_replied', campaignId);
    if (!options.isFollowUp && lead.sentEmails[0] && Date.now() - lead.sentEmails[0].sentAt.getTime() < 24 * 60 * 60 * 1000) {
      return this.block(workspaceId, leadId, 'already_sent_recently', campaignId);
    }
    if (lead.campaignLeads.some(item => item.campaignId !== campaignId && item.status === 'active' && item.campaign.status === 'active')) {
      return this.block(workspaceId, leadId, 'active_campaign_collision', campaignId);
    }
    if (campaignId) {
      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
      if (!campaign || campaign.status !== 'active') return this.block(workspaceId, leadId, 'campaign_paused_or_cancelled', campaignId);
      const sentCount = lead.sentEmails.filter(sent => lead.drafts.some(draft => draft.id === sent.draftId && draft.campaignId === campaignId)).length;
      if (sentCount > campaign.maxFollowUps) return this.block(workspaceId, leadId, 'max_followups_reached', campaignId);
    }
    const settings = await prisma.workspaceSetting.findUnique({ where: { workspaceId } });
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const sentToday = await prisma.sentEmail.count({ where: { workspaceId, sentAt: { gte: start } } });
    if (sentToday >= (settings?.dailySendLimit || 100)) return this.block(workspaceId, leadId, 'daily_limit_reached', campaignId);
    const gmailMock = process.env.GMAIL_MOCK_MODE === 'true';
    if (!gmailMock && !await prisma.googleConnection.findFirst({ where: { workspaceId } })) return this.block(workspaceId, leadId, 'gmail_disconnected', campaignId);
    await audit.log({ workspaceId, entityType: 'Lead', entityId: leadId, action: 'contact_policy_checked', details: { allowed: true, campaignId } });
    return { allowed: true };
  }

  async canScheduleFollowUp(workspaceId: string, leadId: string, campaignId: string): Promise<PolicyResult> {
    const lead = await this.getFullLeadStatus(workspaceId, leadId);
    if (!lead) return { allowed: false, reason: 'lead_not_found' };
    const absolute = await this.checkAbsoluteBlocks(workspaceId, lead);
    if (!absolute.allowed) return absolute;
    if (lead.replies.length || lead.status === 'replied') return { allowed: false, reason: 'lead_replied' };
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
    if (!campaign || campaign.status !== 'active') return { allowed: false, reason: 'campaign_paused_or_cancelled' };
    if (lead.followUpTasks.some(task => task.campaignId === campaignId && ['scheduled', 'ready', 'processing'].includes(task.status))) {
      return { allowed: false, reason: 'followup_already_scheduled' };
    }
    const completed = lead.followUpTasks.filter(task => task.campaignId === campaignId && task.status === 'completed').length;
    if (completed >= Math.min(campaign.maxFollowUps, 4)) return { allowed: false, reason: 'max_followups_reached' };
    return { allowed: true };
  }

  async canReEngageLater(workspaceId: string, leadId: string): Promise<PolicyResult> {
    const lead = await this.getFullLeadStatus(workspaceId, leadId);
    if (!lead) return { allowed: false, reason: 'lead_not_found' };
    const absolute = await this.checkAbsoluteBlocks(workspaceId, lead);
    if (!absolute.allowed) return absolute;
    const negative = lead.replies.find(reply => reply.classification === 'not_interested');
    if (negative && Date.now() - negative.receivedAt.getTime() < 90 * 86400000) return { allowed: false, reason: 'negative_reply_cooldown' };
    const completed = lead.followUpTasks.filter(task => task.status === 'completed').length;
    const lastSent = lead.sentEmails[0];
    if (completed >= 4 && lastSent && Date.now() - lastSent.sentAt.getTime() < 60 * 86400000) {
      return { allowed: false, reason: 'completed_campaign_cooldown' };
    }
    return { allowed: true };
  }

  private async block(workspaceId: string, leadId: string, reason: ContactBlockReason, campaignId?: string): Promise<PolicyResult> {
    await audit.log({ workspaceId, entityType: 'Lead', entityId: leadId, action: 'collision_blocked', details: { reason, campaignId } });
    return { allowed: false, reason };
  }
}
