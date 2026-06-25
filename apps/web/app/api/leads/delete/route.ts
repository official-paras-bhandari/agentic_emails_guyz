import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const { leadIds } = body;
    
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds array is required' }, { status: 400 });
    }

    // Verify leads belong to workspace
    const validLeads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, workspaceId },
      select: { id: true }
    });
    
    const validLeadIds = validLeads.map(l => l.id);
    if (validLeadIds.length === 0) {
      return NextResponse.json({ error: 'No valid leads found for this workspace' }, { status: 400 });
    }

    // Delete many leads (Prisma cascade delete will trigger database cascade constraints automatically)
    await prisma.lead.deleteMany({
      where: { id: { in: validLeadIds } }
    });

    return NextResponse.json({ success: true, deletedCount: validLeadIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
