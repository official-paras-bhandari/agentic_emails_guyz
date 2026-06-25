import { NextRequest, NextResponse } from 'next/server';
import { SuppressionService } from '@/server/services/SuppressionService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { checkRateLimit } from '@/server/security/rate-limit';

const service = new SuppressionService();
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    if (!checkRateLimit(`unsubscribe:${workspaceId}`, 30, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    const entry = await service.add(workspaceId, { email: body.email, domain: body.domain, leadId: body.leadId, reason: body.reason || 'Unsubscribe request', source: body.source || 'unsubscribe_api' });
    return NextResponse.json({ ok: true, id: entry.id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
