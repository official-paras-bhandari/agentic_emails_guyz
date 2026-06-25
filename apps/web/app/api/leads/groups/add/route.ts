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

    // Verify leads belong to workspace
    const validLeads = await prisma.lead.findMany({
      where: {
        id: { in: leadIds },
        workspaceId
      },
      select: { id: true }
    });

    const validLeadIds = validLeads.map(l => l.id);

    if (validLeadIds.length === 0) {
      return NextResponse.json({ error: 'No valid leads found for this workspace' }, { status: 400 });
    }

    // Create many LeadGroupMember records, ignoring duplicates
    const membersData = validLeadIds.map(leadId => ({
      groupId,
      leadId
    }));

    await prisma.leadGroupMember.createMany({
      data: membersData,
      skipDuplicates: true
    });

    return NextResponse.json({ success: true, addedCount: validLeadIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
