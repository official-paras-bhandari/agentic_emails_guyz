import { NextRequest, NextResponse } from 'next/server';
import { MemoryService } from '@/server/services/MemoryService';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

const memoryService = new MemoryService();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = requireWorkspace(req, searchParams.get('workspaceId'));
    const leadId = searchParams.get('leadId') || undefined;
    const campaignId = searchParams.get('campaignId') || undefined;

    const context = await memoryService.getAgentContext(workspaceId, leadId, campaignId);

    return NextResponse.json({
        workspace: context.workspaceMemory,
        lead: context.leadMemory,
        campaign: context.campaignMemory,
        outcomes: context.outcomes
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;
    const workspaceId = requireWorkspace(req, data?.workspaceId);
    data.workspaceId = workspaceId;

    let result;
    switch (type) {
      case 'workspace_memory':
        result = await memoryService.addWorkspaceMemory(data.workspaceId, data);
        break;
      case 'lead_memory':
        result = await memoryService.addLeadMemory(data.workspaceId, data.leadId, data);
        break;
      case 'campaign_memory':
        result = await memoryService.addCampaignMemory(data.workspaceId, data.campaignId, data);
        break;
      case 'outcome_memory':
        result = await memoryService.addOutcomeMemory(data.workspaceId, data);
        break;
      default:
        return NextResponse.json({ error: 'Invalid memory type' }, { status: 400 });
    }

    return NextResponse.json({ status: 'success', data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    if (!body.id || !['workspace', 'lead', 'campaign', 'outcome'].includes(body.type)) return NextResponse.json({ error: 'id and valid type are required' }, { status: 400 });
    if (body.type === 'workspace') await prisma.workspaceMemory.updateMany({ where: { id: body.id, workspaceId }, data: { isActive: false } });
    if (body.type === 'lead') await prisma.leadMemory.deleteMany({ where: { id: body.id, workspaceId } });
    if (body.type === 'campaign') await prisma.campaignMemory.deleteMany({ where: { id: body.id, workspaceId } });
    if (body.type === 'outcome') await prisma.outcomeMemory.deleteMany({ where: { id: body.id, workspaceId } });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, content, workspaceId: requestedWorkspaceId } = body;
    const workspaceId = requireWorkspace(req, requestedWorkspaceId);

    const updated = await prisma.campaignMemory.updateMany({
      where: { id, workspaceId },
      data: { content }
    });

    return NextResponse.json({ status: 'success', data: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}
