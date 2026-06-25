import crypto from 'crypto';
import { prisma } from '@packages/db';
import { ContactPolicyService } from './ContactPolicyService';
import { GmailService } from './GmailService';
import { AuditLogService } from './AuditLogService';

const policy = new ContactPolicyService();
const audit = new AuditLogService();

export class SendQueueService {
  async cleanupExpiredLeases(workspaceId: string) {
    const now = new Date();
    return await prisma.sendQueue.updateMany({
      where: {
        workspaceId,
        status: 'checking_rules',
        leaseExpiresAt: { lt: now }
      },
      data: {
        status: 'pending',
        leaseOwner: null,
        leaseExpiresAt: null
      }
    });
  }

  async processQueue(workspaceId: string, limit = 100) {
    await this.cleanupExpiredLeases(workspaceId);
    const workerId = `sender-${crypto.randomUUID()}`;
    const results = { sent: 0, blocked: 0, failed: 0, skipped: 0 };

    const gmail = new GmailService();
    try { await gmail.initializeForWorkspace(workspaceId); }
    catch {
      const blocked = await prisma.sendQueue.updateMany({
        where: { workspaceId, status: { in: ['pending', 'queued', 'checking_rules'] }, scheduledFor: { lte: new Date() } },
        data: { status: 'blocked', errorReason: 'gmail_disconnected' }
      });
      return { ...results, blocked: blocked.count };
    }

    let remaining = limit;
    while (remaining > 0) {
      const now = new Date();
      const batchSize = Math.min(100, remaining);
      const candidates = await prisma.sendQueue.findMany({
        where: {
          workspaceId,
          status: { in: ['pending', 'queued', 'checking_rules'] },
          scheduledFor: { lte: now },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
        },
        orderBy: { scheduledFor: 'asc' },
        take: batchSize,
        include: { draft: { include: { lead: true, campaign: true, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } },
      });
      if (!candidates.length) break;

      for (const item of candidates) {
        if (remaining <= 0) break;
        remaining--;
        const claimed = await prisma.sendQueue.updateMany({
          where: { id: item.id, workspaceId, status: { in: ['pending', 'queued', 'checking_rules'] }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }] },
          data: { status: 'checking_rules', leaseOwner: workerId, leaseExpiresAt: new Date(Date.now() + 2 * 60_000) },
        });
        if (!claimed.count) { results.skipped++; continue; }
        try {
          const isFollowUp = item.draft.versions.some(version => version.followupNumber !== null);
          const allowed = await policy.canSendNow(workspaceId, item.draft.leadId, item.draft.campaignId || undefined, { isFollowUp });
          if (!allowed.allowed) {
            await prisma.sendQueue.update({ where: { id: item.id }, data: { status: 'blocked', errorReason: allowed.reason, leaseOwner: null, leaseExpiresAt: null } });
            results.blocked++; continue;
          }
          const existingAttempt = await prisma.sentEmail.findUnique({ where: { sendQueueId: item.id } });
          if (existingAttempt) {
            await prisma.sendQueue.update({ where: { id: item.id }, data: { status: existingAttempt.deliveryStatus === 'sent' ? 'sent' : 'blocked', errorReason: existingAttempt.deliveryStatus === 'sent' ? null : 'delivery_reconciliation_required', leaseOwner: null, leaseExpiresAt: null } });
            results.skipped++; continue;
          }
          await prisma.sendQueue.update({ where: { id: item.id }, data: { status: 'queued' } });
          const reservation = await prisma.sentEmail.create({ data: {
            workspaceId, draftId: item.draftId, leadId: item.draft.leadId, sendQueueId: item.id,
            deliveryStatus: 'sending', sentAt: new Date(),
          } });
          await prisma.sendQueue.update({ where: { id: item.id }, data: { status: 'sending' } });
          const result = await gmail.sendEmail(item.draft.lead.email!, item.draft.subject, item.draft.body, `<${item.id}@agentic-outreach.local>`);
          await prisma.$transaction([
            prisma.sentEmail.update({ where: { id: reservation.id }, data: { messageId: result.messageId, threadId: result.threadId, deliveryStatus: 'sent', sentAt: new Date() } }),
            prisma.sendQueue.update({ where: { id: item.id }, data: { status: 'sent', errorReason: null, leaseOwner: null, leaseExpiresAt: null } }),
            prisma.emailDraft.update({ where: { id: item.draftId }, data: { status: 'sent' } }),
            prisma.lead.update({ where: { id: item.draft.leadId }, data: { status: item.draft.campaignId ? 'sent_in_campaign' : 'sent' } }),
          ]);
          await audit.log({ workspaceId, entityType: 'EmailDraft', entityId: item.draftId, action: 'email_sent', details: { messageId: result.messageId, threadId: result.threadId, sendQueueId: item.id } });
          if (item.draft.campaignId && item.draft.campaign?.autoFollowUp) await this.scheduleNextFollowUp(workspaceId, item.draft.leadId, item.draft.campaignId);
          results.sent++;
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Unknown send error';
          await prisma.sentEmail.updateMany({ where: { sendQueueId: item.id, deliveryStatus: 'sending' }, data: { deliveryStatus: 'unknown' } });
          await prisma.sendQueue.update({ where: { id: item.id }, data: { status: 'failed', errorReason: reason, attempts: { increment: 1 }, leaseOwner: null, leaseExpiresAt: null } });
          await audit.log({ workspaceId, entityType: 'SendQueue', entityId: item.id, action: 'email_send_failed', details: { reason } });
          results.failed++;
        }
      }
    }
    return results;
  }

  private async scheduleNextFollowUp(workspaceId: string, leadId: string, campaignId: string) {
    const allowed = await policy.canScheduleFollowUp(workspaceId, leadId, campaignId);
    if (!allowed.allowed) return;
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
    if (!campaign) return;
    const completed = await prisma.followUpTask.count({ where: { workspaceId, leadId, campaignId, status: 'completed' } });
    const stepNumber = completed + 1;
    if (stepNumber > Math.min(campaign.maxFollowUps, 4)) return;
    const delayMinutes = 2;
    const scheduledFor = new Date(Date.now() + delayMinutes * 60_000);
    await prisma.followUpTask.upsert({
      where: { leadId_campaignId_stepNumber: { leadId, campaignId, stepNumber } },
      update: { status: 'scheduled', scheduledFor },
      create: { workspaceId, leadId, campaignId, stepNumber, status: 'scheduled', scheduledFor },
    });
  }
}
