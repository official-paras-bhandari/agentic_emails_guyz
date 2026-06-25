import { NextRequest, NextResponse } from 'next/server';
import { ReplySyncService } from '@/server/services/ReplySyncService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { checkRateLimit } from '@/server/security/rate-limit';

export async function POST(req: NextRequest) {
  try { const body = await req.json().catch(() => ({})); const workspaceId = requireWorkspace(req, body.workspaceId); if (!checkRateLimit(`reply-sync:${workspaceId}`, 5, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 }); return NextResponse.json(await new ReplySyncService().syncReplies(workspaceId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
