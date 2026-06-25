import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, normalizeDomain, normalizeEmail, normalizePhone, securityErrorStatus } from '@/server/security/request';
import { ContactPolicyService } from '@/server/services/ContactPolicyService';

const policy = new ContactPolicyService();
type Context = { params: Promise<{ leadId: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { leadId } = await params;
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId }, include: {
      sources: true, enrichments: true, campaignLeads: { include: { campaign: true } }, drafts: { include: { sendQueue: true } },
      sentEmails: { orderBy: { sentAt: 'desc' } }, replies: { orderBy: { receivedAt: 'desc' } }, followUpTasks: { orderBy: { scheduledFor: 'desc' } },
      groups: { include: { group: true } },
    } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const [sendNow, reengage] = await Promise.all([policy.canSendNow(workspaceId, leadId), policy.canReEngageLater(workspaceId, leadId)]);
    return NextResponse.json({ lead, policy: { sendNow, reengage } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const { leadId } = await params;
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const updated = await prisma.lead.update({ where: { id: leadId }, data: {
      businessName: body.businessName, email: body.email === undefined ? undefined : normalizeEmail(body.email),
      website: body.website, normalizedDomain: body.website === undefined ? undefined : normalizeDomain(body.website),
      phone: body.phone, normalizedPhone: body.phone === undefined ? undefined : normalizePhone(body.phone), suburb: body.suburb,
      firstName: body.firstName, lastName: body.lastName,
    } });
    return NextResponse.json(updated);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { leadId } = await params;
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    await prisma.lead.delete({ where: { id: leadId } });
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
