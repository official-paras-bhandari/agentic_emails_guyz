import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req, body.workspaceId);
    await prisma.googleConnection.deleteMany({ where: { workspaceId } });
    await prisma.sendQueue.updateMany({ where: { workspaceId, status: { in: ['pending', 'checking_rules', 'queued'] } }, data: { status: 'blocked', errorReason: 'gmail_disconnected' } });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
