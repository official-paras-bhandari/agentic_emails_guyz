import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { FollowUpService } from '@/server/services/FollowUpService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function GET(req: NextRequest) {
  try { const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId')); return NextResponse.json(await prisma.followUpTask.findMany({ where: { workspaceId }, include: { lead: true, campaign: true }, orderBy: { scheduledFor: 'asc' } })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
export async function POST(req: NextRequest) {
  try { const body = await req.json(); const workspaceId = requireWorkspace(req, body.workspaceId); return NextResponse.json(await new FollowUpService().processDueTasks(workspaceId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
