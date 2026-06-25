import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { MemoryService } from '@/server/services/MemoryService';
import { DraftService } from '@/server/services/DraftService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

const memoryService = new MemoryService();
const draftService = new DraftService();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const { subject, body, rewriteInstruction, workspaceId: requestedWorkspaceId } = await req.json();
    const workspaceId = requireWorkspace(req, requestedWorkspaceId);
    if (typeof subject !== 'string' || typeof body !== 'string') return NextResponse.json({ error: 'subject and body are required' }, { status: 400 });

    const oldDraft = await prisma.emailDraft.findFirst({ where: { id: draftId, workspaceId } });
    if (!oldDraft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    await draftService.createVersion(draftId, { subject, body, createdBy: 'user', rewriteInstruction });
    const updatedDraft = await prisma.emailDraft.findUniqueOrThrow({ where: { id: draftId } });

    // Create Outcome Memory for the edit
    await memoryService.addOutcomeMemory(updatedDraft.workspaceId, {
      leadId: updatedDraft.leadId,
      campaignId: updatedDraft.campaignId || undefined,
      emailDraftId: draftId,
      eventType: 'edited',
      summary: rewriteInstruction || 'Draft was manually edited by user.',
      scoreImpact: -0.2 // Edits slightly reduce "confidence" in the original agent output
    });

    return NextResponse.json(updatedDraft);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const draft = await prisma.emailDraft.findFirst({ where: { id: draftId, workspaceId } });
    
    if (draft) {
      await prisma.emailDraft.update({
        where: { id: draftId },
        data: { status: 'cancelled' }
      });

      await memoryService.addOutcomeMemory(draft.workspaceId, {
        leadId: draft.leadId,
        campaignId: draft.campaignId || undefined,
        emailDraftId: draftId,
        eventType: 'rejected',
        summary: 'Draft was rejected/deleted by user.',
        scoreImpact: -0.5
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}
