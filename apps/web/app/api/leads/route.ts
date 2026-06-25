import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, normalizeDomain, normalizeEmail, normalizePhone, securityErrorStatus } from '@/server/security/request';
import { DedupeService } from '@/server/services/DedupeService';

const dedupe = new DedupeService();

export async function GET(req: NextRequest) {
  try {
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const search = req.nextUrl.searchParams.get('q')?.trim();
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const groupId = req.nextUrl.searchParams.get('groupId') || undefined;
    const leads = await prisma.lead.findMany({ where: {
      workspaceId, status,
      ...(groupId ? { groups: { some: { groupId } } } : {}),
      ...(search ? { OR: [
        { businessName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } }, { suburb: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    }, include: { 
      sources: { orderBy: { createdAt: 'desc' }, take: 3 }, 
      groups: { include: { group: true } },
      _count: { select: { sentEmails: true, replies: true, followUpTasks: true } } 
    }, orderBy: { createdAt: 'desc' }, take: 200 });
    return NextResponse.json(leads);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    if (!body.businessName && !body.email && !body.website) return NextResponse.json({ error: 'Business name, email or website is required' }, { status: 400 });
    const existing = await dedupe.findExistingLead(workspaceId, body);
    if (existing) return NextResponse.json({ lead: existing.lead, duplicate: true, reason: existing.reason }, { status: 200 });
    const sourceUrl = body.sourceUrl || body.website;
    const lead = await prisma.lead.create({ data: {
      workspaceId, email: normalizeEmail(body.email), businessName: body.businessName?.trim(), website: body.website?.trim(),
      normalizedDomain: normalizeDomain(body.website), phone: body.phone?.trim(), normalizedPhone: normalizePhone(body.phone),
      suburb: body.suburb?.trim(), status: 'new',
      firstName: body.firstName?.trim(), lastName: body.lastName?.trim(),
      ...(sourceUrl ? { sources: { create: { url: sourceUrl, type: body.pageType || 'manual', extractionLocation: 'manual' } } } : {}),
    }, include: { sources: true } });
    return NextResponse.json(lead, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
