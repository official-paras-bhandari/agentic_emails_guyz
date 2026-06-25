import { NextRequest, NextResponse } from 'next/server';
import { DraftService } from '@/server/services/DraftService';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

const draftService = new DraftService();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const { instruction, workspaceId: requestedWorkspaceId, preview } = await req.json();
    const workspaceId = requireWorkspace(req, requestedWorkspaceId);
    if (!await prisma.emailDraft.findFirst({ where: { id: draftId, workspaceId } })) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

    const result = await draftService.rewriteWithAI(draftId, instruction, !!preview);

    return NextResponse.json({ 
      status: 'success', 
      version: result 
    });
  } catch (error: any) {
    console.error('Rewrite failed:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: securityErrorStatus(error) });
  }
}
