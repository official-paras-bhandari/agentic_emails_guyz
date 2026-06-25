import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { MemoryService } from '@/server/services/MemoryService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { ContactPolicyService } from '@/server/services/ContactPolicyService';

const memoryService = new MemoryService();
const policy = new ContactPolicyService();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req, body.workspaceId);

    const draft = await prisma.emailDraft.findFirst({ where: { id: draftId, workspaceId } });
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    const updatedDraft = await prisma.emailDraft.update({
      where: { id: draftId },
      data: { status: 'approved' },
    });

    // Create Outcome Memory for the approval
    await memoryService.addOutcomeMemory(updatedDraft.workspaceId, {
      leadId: updatedDraft.leadId,
      campaignId: updatedDraft.campaignId || undefined,
      emailDraftId: draftId,
      eventType: 'approved',
      summary: 'Draft was approved by user.',
      scoreImpact: 0.5
    });

    const canQueue = await policy.canQueueSend(workspaceId, draft.leadId, draft.campaignId || undefined);
    if (!canQueue.allowed) return NextResponse.json({ error: canQueue.reason }, { status: 409 });
    await prisma.sendQueue.upsert({ where: { draftId }, update: { status: 'pending', errorReason: null }, create: { workspaceId, draftId, status: 'pending' } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}
