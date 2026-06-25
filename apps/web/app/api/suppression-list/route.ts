import { NextRequest, NextResponse } from 'next/server';
import { SuppressionService } from '@/server/services/SuppressionService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

const service = new SuppressionService();
export async function GET(req: NextRequest) {
  try { return NextResponse.json(await service.list(requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId')))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
export async function POST(req: NextRequest) {
  try { const body = await req.json(); return NextResponse.json(await service.add(requireWorkspace(req, body.workspaceId), { ...body, source: body.source || 'manual' }), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
export async function DELETE(req: NextRequest) {
  try { const body = await req.json(); const workspaceId = requireWorkspace(req, body.workspaceId); await service.remove(workspaceId, body.id, body.confirmed === true); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
