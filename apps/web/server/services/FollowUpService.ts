import { prisma } from '@packages/db';
import { ContactPolicyService } from './ContactPolicyService';
import { AuditLogService } from './AuditLogService';
import { DraftService } from './DraftService';

const policy = new ContactPolicyService();
const audit = new AuditLogService();

export class FollowUpService {
  async processDueTasks(workspaceId: string) {
    const tasks = await prisma.followUpTask.findMany({
      where: { workspaceId, status: 'scheduled', scheduledFor: { lte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      include: { lead: true, campaign: true },
    });

    const results = { dispatched: 0, skipped: 0, failed: 0 };

    for (const task of tasks) {
      // Validate basic requirements
      if (!task.campaignId || !task.lead?.email) {
        await prisma.followUpTask.update({ where: { id: task.id }, data: { status: 'skipped' } });
        results.skipped++;
        continue;
      }

      // Policy check
      const allowed = await policy.canScheduleFollowUp(workspaceId, task.leadId, task.campaignId);
      if (!allowed.allowed && allowed.reason !== 'followup_already_scheduled') {
        await prisma.followUpTask.update({ where: { id: task.id }, data: { status: 'skipped' } });
        await audit.log({
          workspaceId,
          entityType: 'FollowUpTask',
          entityId: task.id,
          action: 'followup_blocked',
          details: { reason: allowed.reason },
        });
        results.skipped++;
        continue;
      }

      // Mark as processing before dispatching to worker
      await prisma.followUpTask.update({ where: { id: task.id }, data: { status: 'processing' } });

      try {
        // Fetch past sent emails for this lead/campaign to give context to FollowUpAgent
        const sentEmails = await prisma.sentEmail.findMany({
          where: {
            workspaceId,
            leadId: task.leadId,
            draft: { campaignId: task.campaignId },
            deliveryStatus: 'sent',
          },
          include: { draft: { select: { subject: true, body: true } } },
          orderBy: { sentAt: 'asc' },
        });

        const pastEmails = sentEmails.map(se => ({
          subject: se.draft.subject,
          body: se.draft.body,
          sentAt: se.sentAt.toISOString(),
        }));

        // Dispatch to Python worker via a background Job
        await this.dispatchFollowUpToWorker(workspaceId, task, pastEmails);

        await audit.log({
          workspaceId,
          entityType: 'FollowUpTask',
          entityId: task.id,
          action: 'followup_dispatched',
          details: { stepNumber: task.stepNumber, pastEmailCount: pastEmails.length },
        });

        results.dispatched++;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'dispatch_failed';
        await prisma.followUpTask.update({ where: { id: task.id }, data: { status: 'scheduled' } }); // revert so it retries next cron
        await audit.log({
          workspaceId,
          entityType: 'FollowUpTask',
          entityId: task.id,
          action: 'followup_dispatch_failed',
          details: { reason },
        });
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Dispatches a follow-up task to the Python worker by creating a Job record
   * and posting to the worker. The worker calls FollowUpAgent and fires
   * a `draft_created` webhook which DraftService handles (auto-approved + queued).
   */
  private async dispatchFollowUpToWorker(
    workspaceId: string,
    task: { id: string; leadId: string; campaignId: string | null; stepNumber: number },
    pastEmails: { subject: string; body: string; sentAt: string }[],
  ) {
    // Create a lightweight Job record so the webhook handler can find workspaceId
    const job = await prisma.job.create({
      data: {
        workspaceId,
        name: `Follow-up step ${task.stepNumber}`,
        status: 'queued',
        progress: 0,
        steps: {
          create: [{ name: 'followup', status: 'pending' }],
        },
      },
    });

    // Mark the followup task with this jobId so we can update it from the webhook
    await prisma.followUpTask.update({
      where: { id: task.id },
      data: { status: 'processing' },
    });

    // Await the dispatch so we can revert the task if the worker is unavailable.
    const workerUrl = process.env.WORKER_URL || 'http://localhost:5000';
    const internalKey = process.env.INTERNAL_API_KEY || '';
    const response = await fetch(`${workerUrl}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': internalKey },
      body: JSON.stringify({
        workspace_id: workspaceId,
        job_id: job.id,
        prompt: `draft_followup campaignId:${task.campaignId} leadId:${task.leadId} stepNumber:${task.stepNumber}`,
        intent: 'draft_followup',
        parameters: {
          campaign_id: task.campaignId,
          lead_id: task.leadId,
          step_number: task.stepNumber,
          followup_task_id: task.id,
          past_emails: pastEmails,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Worker dispatch failed: ${errorText}`);
    }

    return job;
  }

  /**
   * Called by the webhook handler when a followup draft_created event arrives.
   * Marks the FollowUpTask as completed.
   */
  async markTaskCompleted(workspaceId: string, followupTaskId: string) {
    await prisma.followUpTask.updateMany({
      where: { id: followupTaskId, workspaceId },
      data: { status: 'completed' },
    });
  }
}
