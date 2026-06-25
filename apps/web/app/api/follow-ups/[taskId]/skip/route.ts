import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try { const { taskId } = await params; const body = await req.json().catch(() => ({})); const workspaceId = requireWorkspace(req, body.workspaceId); const changed = await prisma.followUpTask.updateMany({ where: { id: taskId, workspaceId, status: { in: ['scheduled', 'ready'] } }, data: { status: 'skipped' } }); if (!changed.count) return NextResponse.json({ error: 'Task not found' }, { status: 404 }); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
