import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { FollowUpService } from '@/server/services/FollowUpService';
import { ReplySyncService } from '@/server/services/ReplySyncService';
import { SendQueueService } from '@/server/services/SendQueueService';

const followUpService = new FollowUpService();
const replySyncService = new ReplySyncService();
const sendQueueService = new SendQueueService();

/**
 * GET /api/cron
 * Called every 15 minutes by Vercel Cron (or any external scheduler).
 * 1. Syncs Gmail replies → classifies → cancels follow-ups when someone responds
 * 2. Processes due follow-up tasks → dispatches to FollowUpAgent → queues sends
 * 3. Flushes the send queue → delivers emails via Gmail
 *
 * Secured by CRON_SECRET header to prevent unauthorized access.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  // Verify cron secret if configured (Vercel sets Authorization: Bearer <CRON_SECRET>)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const report: Record<string, any> = {
    timestamp: new Date().toISOString(),
    workspaces: [],
    errors: [],
  };

  try {
    // Get all workspaces that have active campaigns with autoFollowUp enabled
    const activeWorkspaces = await prisma.workspace.findMany({
      where: {
        campaigns: {
          some: {
            status: 'active',
            autoFollowUp: true,
          },
        },
      },
      select: { id: true, name: true },
    });

    for (const workspace of activeWorkspaces) {
      const workspaceReport: Record<string, any> = {
        workspaceId: workspace.id,
        name: workspace.name,
      };

      try {
        // Step 1: Sync Gmail replies — detects new replies and cancels follow-ups automatically
        const syncResult = await replySyncService.syncReplies(workspace.id);
        workspaceReport.repliesSynced = syncResult.synced;
      } catch (err) {
        workspaceReport.replyError = err instanceof Error ? err.message : 'sync_failed';
      }

      try {
        // Step 2: Process overdue follow-up tasks — dispatches to FollowUpAgent
        const followUpResult = await followUpService.processDueTasks(workspace.id);
        workspaceReport.followUps = followUpResult;
      } catch (err) {
        workspaceReport.followUpError = err instanceof Error ? err.message : 'followup_failed';
      }

      try {
        // Step 3: Flush the send queue — delivers any emails that are ready
        const sendResult = await sendQueueService.processQueue(workspace.id, 100);
        workspaceReport.sends = sendResult;
      } catch (err) {
        workspaceReport.sendError = err instanceof Error ? err.message : 'send_failed';
      }

      report.workspaces.push(workspaceReport);
    }
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : 'cron_failed');
  }

  report.durationMs = Date.now() - startTime;
  console.log('[CRON] Completed:', JSON.stringify(report));

  return NextResponse.json(report, { status: 200 });
}
