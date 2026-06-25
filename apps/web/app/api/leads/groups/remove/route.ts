import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    
    const { groupId, leadIds } = body;

    if (!groupId || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'groupId and a non-empty leadIds array are required' }, { status: 400 });
    }

    // Verify group belongs to workspace
    const group = await prisma.leadGroup.findFirst({
      where: { id: groupId, workspaceId }
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Delete records matching groupId and leadIds
    const result = await prisma.leadGroupMember.deleteMany({
      where: {
        groupId,
        leadId: { in: leadIds }
      }
    });

    return NextResponse.json({ success: true, removedCount: result.count });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
