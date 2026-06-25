import { prisma } from '@packages/db';
import { ContactPolicyService } from './ContactPolicyService';

const policy = new ContactPolicyService();

export class CampaignService {
  list(workspaceId: string) {
    return prisma.campaign.findMany({ where: { workspaceId }, include: { _count: { select: { campaignLeads: true, drafts: true, followUpTasks: true } } }, orderBy: { updatedAt: 'desc' } });
  }
  create(workspaceId: string, input: any) {
    if (!input.name?.trim()) throw new Error('Campaign name is required');
    return prisma.campaign.create({ data: {
      workspaceId, name: input.name.trim(), goal: input.goal, offer: input.offer, targetIndustry: input.targetIndustry,
      targetLocation: input.targetLocation, dailySendLimit: Math.max(1, Math.min(Number(input.dailySendLimit || 50), 500)),
      maxFollowUps: Math.max(0, Math.min(Number(input.maxFollowUps ?? 4), 4)), autoFollowUp: input.autoFollowUp !== false,
      verificationMode: ['manual_verify', 'auto_verify', 'remove_control'].includes(input.verificationMode) ? input.verificationMode : 'remove_control',
      autoVerifyThreshold: Math.max(0, Math.min(Number(input.autoVerifyThreshold ?? 0.85), 1)), status: 'draft',
      businessWebsite: input.businessWebsite?.trim(),
      businessDescription: input.businessDescription?.trim(),
      targetPersona: input.targetPersona?.trim(),
    } });
  }
  async addLead(workspaceId: string, campaignId: string, leadId: string) {
    const allowed = await policy.canAddToCampaign(workspaceId, leadId, campaignId);
    if (!allowed.allowed) throw new Error(allowed.reason || 'Campaign collision');
    return prisma.campaignLead.create({ data: { campaignId, leadId, status: 'active' } });
  }
}
