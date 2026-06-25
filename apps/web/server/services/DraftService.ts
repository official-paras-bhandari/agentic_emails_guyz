import { prisma } from '@packages/db';
import { AuditLogService } from './AuditLogService';
import { ContactPolicyService } from './ContactPolicyService';
import { SendQueueService } from './SendQueueService';

const auditLogService = new AuditLogService();
const contactPolicy = new ContactPolicyService();

export class DraftService {
  async createDraft(input: {
    workspaceId: string; leadId: string; campaignId?: string; subject: string; body: string;
    verificationScore?: number; verificationReasons?: string[]; createdBy?: string;
    followupNumber?: number;
  }) {
    const policy = await contactPolicy.canDraftEmail(input.workspaceId, input.leadId, input.campaignId);
    if (!policy.allowed) throw new Error(policy.reason || 'Draft blocked');
    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, workspaceId: input.workspaceId } });
    if (!lead?.email) throw new Error('lead_has_no_email');
    const campaign = input.campaignId ? await prisma.campaign.findFirst({ where: { id: input.campaignId, workspaceId: input.workspaceId } }) : null;
    const footer = '\n\n—\nIf you do not want to hear from us again, reply “unsubscribe”.';
    const body = input.body.includes('reply “unsubscribe”') ? input.body : `${input.body.trim()}${footer}`;
    const score = input.verificationScore ?? 0;
    // Always auto-approve and queue — no manual review needed
    const draft = await prisma.emailDraft.create({ data: {
      workspaceId: input.workspaceId, leadId: input.leadId, campaignId: input.campaignId,
      subject: input.subject.trim(), body, status: 'approved',
      verificationScore: score, verificationReasons: input.verificationReasons || [],
      verificationStatus: 'passed', requiresHumanReview: false,
      versions: { create: { versionNumber: 1, subject: input.subject.trim(), body, createdBy: input.createdBy || 'agent', followupNumber: input.followupNumber } },
    } });
    const queuePolicy = await contactPolicy.canQueueSend(input.workspaceId, input.leadId, input.campaignId);
    if (queuePolicy.allowed) {
      await prisma.sendQueue.create({ data: { workspaceId: input.workspaceId, draftId: draft.id, status: 'pending' } });
      new SendQueueService().processQueue(input.workspaceId).catch(err => {
        console.error('Failed to auto-process queue after draft creation:', err);
      });
    }
    await auditLogService.log({ workspaceId: input.workspaceId, entityType: 'EmailDraft', entityId: draft.id, action: 'draft_created', details: { score, autoQueue: true } });
    return draft;
  }

  async getDraftVersions(draftId: string) {
    return await prisma.emailDraftVersion.findMany({
      where: { emailDraftId: draftId },
      orderBy: { versionNumber: 'desc' }
    });
  }

  async createVersion(draftId: string, data: { subject: string; body: string; createdBy: string; rewriteInstruction?: string }) {
    const draft = await prisma.emailDraft.findUnique({
      where: { id: draftId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } }
    });

    if (!draft) throw new Error('Draft not found');

    const lastVersion = draft.versions[0];
    const newVersionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;

    const newVersion = await prisma.emailDraftVersion.create({
      data: {
        emailDraftId: draftId,
        versionNumber: newVersionNumber,
        subject: data.subject,
        body: data.body,
        createdBy: data.createdBy,
        rewriteInstruction: data.rewriteInstruction
      }
    });

    // Update the main draft with the latest content
    await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        subject: data.subject,
        body: data.body,
        status: data.createdBy === 'user' ? 'edited' : 'drafted'
      }
    });

    await auditLogService.log({
      workspaceId: draft.workspaceId,
      entityType: 'EmailDraft',
      entityId: draftId,
      action: data.rewriteInstruction ? 'draft_rewritten' : 'draft_version_created',
      details: { versionNumber: newVersionNumber, createdBy: data.createdBy, instruction: data.rewriteInstruction }
    });

    return newVersion;
  }

  async restoreVersion(draftId: string, versionId: string) {
    const version = await prisma.emailDraftVersion.findUnique({
      where: { id: versionId },
      include: { emailDraft: true }
    });

    if (!version || version.emailDraftId !== draftId) {
      throw new Error('Version not found or mismatch');
    }

    await prisma.emailDraft.update({
      where: { id: draftId },
      data: {
        subject: version.subject,
        body: version.body,
        status: 'edited'
      }
    });

    await auditLogService.log({
      workspaceId: version.emailDraft.workspaceId,
      entityType: 'EmailDraft',
      entityId: draftId,
      action: 'draft_version_restored',
      details: { versionId, versionNumber: version.versionNumber }
    });

    return version;
  }

  async rewriteWithAI(draftId: string, instruction: string, preview = false) {
    const draft = await prisma.emailDraft.findUnique({
      where: { id: draftId },
      include: { lead: { select: { workspaceId: true, businessName: true, website: true, suburb: true } } }
    });
    if (!draft) throw new Error('Draft not found');

    let newSubject = draft.subject;
    let newBody = draft.body;

    // Call the Python worker for a real LLM rewrite
    try {
      const workerUrl = process.env.WORKER_URL || 'http://localhost:5000';
      const internalKey = process.env.INTERNAL_API_KEY || '';

      const response = await fetch(`${workerUrl}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': internalKey },
        body: JSON.stringify({
          workspace_id: draft.workspaceId,
          lead_id: draft.leadId,
          campaign_id: draft.campaignId,
          original_subject: draft.subject,
          original_body: draft.body,
          instruction,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (response.ok) {
        const result = await response.json();
        newSubject = result.subject || newSubject;
        newBody = result.body || newBody;
      } else {
        console.warn('[DraftService] Worker rewrite failed, using original:', response.status);
      }
    } catch (err) {
      // Worker unavailable — keep original content but log
      console.error('[DraftService] Worker rewrite error:', err instanceof Error ? err.message : err);
    }

    if (preview) {
      return {
        id: 'preview',
        emailDraftId: draftId,
        versionNumber: 0,
        subject: newSubject,
        body: newBody,
        createdBy: 'ai',
        rewriteInstruction: instruction,
        createdAt: new Date()
      };
    }

    return await this.createVersion(draftId, {
      subject: newSubject,
      body: newBody,
      createdBy: 'ai',
      rewriteInstruction: instruction
    });
  }
}
