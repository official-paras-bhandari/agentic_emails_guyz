import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { ContactPolicyService } from '@/server/services/ContactPolicyService';
import { SendQueueService } from '@/server/services/SendQueueService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { checkRateLimit } from '@/server/security/rate-limit';

const policy = new ContactPolicyService();
const queue = new SendQueueService();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    if (!checkRateLimit(`send:${workspaceId}`, 20, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    if (body.action === 'process') return NextResponse.json(await queue.processQueue(workspaceId, 100));
    if (!body.draftId) return NextResponse.json({ error: 'draftId is required' }, { status: 400 });
    const draft = await prisma.emailDraft.findFirst({ where: { id: body.draftId, workspaceId } });
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    const allowed = await policy.canQueueSend(workspaceId, draft.leadId, draft.campaignId || undefined);
    if (!allowed.allowed) return NextResponse.json({ error: allowed.reason }, { status: 409 });
    const item = await prisma.sendQueue.upsert({ where: { draftId: draft.id }, update: { status: 'pending', scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : new Date(), errorReason: null }, create: { workspaceId, draftId: draft.id, status: 'pending', scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : new Date() } });
    return NextResponse.json(item, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
