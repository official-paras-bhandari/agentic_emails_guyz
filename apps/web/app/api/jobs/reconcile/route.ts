import { NextRequest, NextResponse } from 'next/server';
import { JobService } from '@/server/services/JobService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function POST(req: NextRequest) {
  try { const body = await req.json().catch(() => ({})); requireWorkspace(req, body.workspaceId); const failed = await new JobService().failStaleJobs(Number(body.staleAfterMinutes || 30)); return NextResponse.json({ failed }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
