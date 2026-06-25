import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { DraftService } from '@/server/services/DraftService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

const service = new DraftService();
export async function GET(req: NextRequest) {
  try {
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const status = req.nextUrl.searchParams.get('status') || undefined;
    return NextResponse.json(await prisma.emailDraft.findMany({ where: { workspaceId, status }, include: { lead: true, campaign: true, versions: { orderBy: { versionNumber: 'desc' } }, sendQueue: true }, orderBy: { updatedAt: 'desc' }, take: 200 }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    if (!body.leadId || typeof body.subject !== 'string' || typeof body.body !== 'string') return NextResponse.json({ error: 'leadId, subject and body are required' }, { status: 400 });
    return NextResponse.json(await service.createDraft({ ...body, workspaceId, createdBy: body.createdBy || 'user' }), { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
