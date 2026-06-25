import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { ContactPolicyService } from '@/server/services/ContactPolicyService';
import { SendQueueService } from '@/server/services/SendQueueService';

const policy = new ContactPolicyService();
const sendQueue = new SendQueueService();

type Context = { params: Promise<{ campaignId: string }> };

/**
 * POST /api/campaigns/:id/approve-all
 * Bulk-approves all `needs_review` drafts for a campaign,
 * queues them into the send queue, and then processes the queue immediately.
 */
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { campaignId } = await params;
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req, body.workspaceId);

    // Find all needs_review drafts for this campaign
    const drafts = await prisma.emailDraft.findMany({
      where: { campaignId, workspaceId, status: 'needs_review' },
      include: { lead: true }
    });

    if (!drafts.length) {
      return NextResponse.json({ queued: 0, skipped: 0, message: 'No drafts pending review' });
    }

    let queued = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const draft of drafts) {
      try {
        const canQueue = await policy.canQueueSend(workspaceId, draft.leadId, campaignId);
        if (!canQueue.allowed) {
          skipped++;
          continue;
        }

        await prisma.emailDraft.update({
          where: { id: draft.id },
          data: { status: 'approved' }
        });

        await prisma.sendQueue.upsert({
          where: { draftId: draft.id },
          update: { status: 'pending', scheduledFor: new Date(), errorReason: null },
          create: { workspaceId, draftId: draft.id, status: 'pending', scheduledFor: new Date() }
        });

        queued++;
      } catch (err) {
        errors.push(`Draft ${draft.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
        skipped++;
      }
    }

    // Immediately process the queue
    let sendResult = null;
    if (queued > 0) {
      try {
        sendResult = await sendQueue.processQueue(workspaceId);
      } catch {
        // Non-fatal: items are already queued and will be processed by cron
      }
    }

    return NextResponse.json({
      queued,
      skipped,
      sendResult,
      errors: errors.length ? errors : undefined,
      message: `${queued} draft(s) approved and queued for sending.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
