import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { SendQueueService } from '@/server/services/SendQueueService';
import { securityErrorStatus } from '@/server/security/request';

const queue = new SendQueueService();

/**
 * POST /api/send/cron
 * Processes the send queue for ALL active workspaces.
 * Should be called every ~60 seconds by an external cron (e.g. Vercel Cron, crontab, etc.)
 *
 * Can also be called manually for a specific workspace:
 *   POST /api/send/cron   { "workspaceId": "ws_xxx" }
 */
export async function POST(req: NextRequest) {
  try {
    // Allow a specific workspaceId for manual triggering, or process all active workspaces
    let body: { workspaceId?: string } = {};
    try { body = await req.json(); } catch { /* no body is fine */ }

    if (body.workspaceId) {
      const result = await queue.processQueue(body.workspaceId, 100);
      return NextResponse.json({ processed: 1, results: { [body.workspaceId]: result } });
    }

    // Find all workspaces that have items in the send queue
    const activeWorkspaces = await prisma.sendQueue.findMany({
      where: { status: { in: ['pending', 'queued'] }, scheduledFor: { lte: new Date() } },
      distinct: ['workspaceId'],
      select: { workspaceId: true },
    });

    const results: Record<string, unknown> = {};
    for (const { workspaceId } of activeWorkspaces) {
      try {
        results[workspaceId] = await queue.processQueue(workspaceId, 100);
      } catch (err) {
        results[workspaceId] = { error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }

    return NextResponse.json({ processed: activeWorkspaces.length, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron failed' },
      { status: securityErrorStatus(error) }
    );
  }
}

/**
 * GET /api/send/cron
 * Returns the current state of the send queue across all workspaces.
 */
export async function GET(req: NextRequest) {
  try {
    const counts = await prisma.sendQueue.groupBy({
      by: ['status'],
      _count: { id: true }
    });
    return NextResponse.json({ queue: counts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
