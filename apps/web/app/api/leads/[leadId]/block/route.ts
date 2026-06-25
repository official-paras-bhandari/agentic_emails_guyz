import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { SuppressionService } from '@/server/services/SuppressionService';

const suppression = new SuppressionService();
export async function POST(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const { leadId } = await params;
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'blocked' } });
    if (lead.email || lead.website) await suppression.add(workspaceId, { leadId, email: lead.email, domain: lead.website, reason: body.reason || 'Manual block', source: 'manual' });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
