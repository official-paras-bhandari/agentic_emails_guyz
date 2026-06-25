import { prisma } from '@packages/db';
import { normalizeDomain, normalizeEmail, normalizePhone } from '../security/request';

export class DedupeService {
  async findExistingLeadsBatch(workspaceId: string, leads: Array<{
    email?: string | null; website?: string | null; phone?: string | null;
    businessName?: string | null; suburb?: string | null; sourceUrl?: string | null;
  }>) {
    if (!leads.length) return new Map();

    const normalizedInputs = leads.map(l => ({
      original: l,
      email: normalizeEmail(l.email),
      domain: normalizeDomain(l.website),
      phone: normalizePhone(l.phone),
      businessName: l.businessName?.trim() || null,
      suburb: l.suburb?.trim() || null,
      sourceUrl: l.sourceUrl?.trim() || null,
    }));

    // Collect all unique criteria to query
    const emails = Array.from(new Set(normalizedInputs.map(i => i.email).filter((e): e is string => !!e)));
    const domains = Array.from(new Set(normalizedInputs.map(i => i.domain).filter((d): d is string => !!d)));
    const phones = Array.from(new Set(normalizedInputs.map(i => i.phone).filter((p): p is string => !!p)));
    const sourceUrls = Array.from(new Set(normalizedInputs.map(i => i.sourceUrl).filter((u): u is string => !!u)));
    
    // Group name+suburb pairs uniquely (case-insensitive key)
    const nameSuburbMap = new Map<string, { name: string; suburb: string }>();
    for (const input of normalizedInputs) {
      if (input.businessName && input.suburb) {
        const key = `${input.businessName.toLowerCase()}|${input.suburb.toLowerCase()}`;
        nameSuburbMap.set(key, { name: input.businessName, suburb: input.suburb });
      }
    }
    const nameSuburbPairs = Array.from(nameSuburbMap.values());

    // Execute queries in parallel to minimize latency (bounded queries)
    const [existingByEmail, existingByDomain, existingByPhone, existingByNameSuburb, existingBySource] = await Promise.all([
      emails.length ? prisma.lead.findMany({ where: { workspaceId, email: { in: emails } } }) : Promise.resolve([]),
      domains.length ? prisma.lead.findMany({ where: { workspaceId, normalizedDomain: { in: domains } } }) : Promise.resolve([]),
      phones.length ? prisma.lead.findMany({ where: { workspaceId, normalizedPhone: { in: phones } } }) : Promise.resolve([]),
      nameSuburbPairs.length ? prisma.lead.findMany({
        where: {
          workspaceId,
          OR: nameSuburbPairs.map(p => ({
            businessName: { equals: p.name, mode: 'insensitive' },
            suburb: { equals: p.suburb, mode: 'insensitive' }
          }))
        }
      }) : Promise.resolve([]),
      sourceUrls.length ? prisma.leadSource.findMany({
        where: { url: { in: sourceUrls }, lead: { workspaceId } },
        include: { lead: true }
      }) : Promise.resolve([])
    ]);

    // Build lookup helper maps for O(1) matching
    const leadByEmail = new Map(existingByEmail.map(l => [l.email, l]));
    const leadByDomain = new Map(existingByDomain.map(l => [l.normalizedDomain, l]));
    const leadByPhone = new Map(existingByPhone.map(l => [l.normalizedPhone, l]));
    
    const leadByNameSuburb = new Map<string, any>();
    for (const l of existingByNameSuburb) {
      if (l.businessName && l.suburb) {
        const key = `${l.businessName.toLowerCase()}|${l.suburb.toLowerCase()}`;
        leadByNameSuburb.set(key, l);
      }
    }

    const leadBySource = new Map(existingBySource.map(s => [s.url, s.lead]));

    // Now map each input lead to a duplicate status deterministically, matching priority:
    // 1. email, 2. domain, 3. phone, 4. business name + suburb, 5. source URL
    const resultsMap = new Map<any, { lead: any; reason: string } | null>();

    for (const input of normalizedInputs) {
      let duplicate: { lead: any; reason: string } | null = null;

      if (input.email) {
        const match = leadByEmail.get(input.email);
        if (match) duplicate = { lead: match, reason: 'duplicate_email' };
      }
      
      if (!duplicate && input.domain) {
        const match = leadByDomain.get(input.domain);
        if (match) duplicate = { lead: match, reason: 'duplicate_domain' };
      }

      if (!duplicate && input.phone) {
        const match = leadByPhone.get(input.phone);
        if (match) duplicate = { lead: match, reason: 'duplicate_phone' };
      }

      if (!duplicate && input.businessName && input.suburb) {
        const key = `${input.businessName.toLowerCase()}|${input.suburb.toLowerCase()}`;
        const match = leadByNameSuburb.get(key);
        if (match) duplicate = { lead: match, reason: 'duplicate_business_suburb' };
      }

      if (!duplicate && input.sourceUrl) {
        const match = leadBySource.get(input.sourceUrl);
        if (match) duplicate = { lead: match, reason: 'duplicate_source_url' };
      }

      resultsMap.set(input.original, duplicate);
    }

    return resultsMap;
  }

  async findExistingLead(workspaceId: string, data: {
    email?: string | null; website?: string | null; phone?: string | null;
    businessName?: string | null; suburb?: string | null; sourceUrl?: string | null;
  }) {
    const results = await this.findExistingLeadsBatch(workspaceId, [data]);
    return results.get(data) || null;
  }

  async isSuppressed(workspaceId: string, email?: string | null, website?: string | null) {
    const normalizedEmail = normalizeEmail(email);
    const domain = normalizeDomain(website);
    const clauses = [...(normalizedEmail ? [{ email: normalizedEmail }] : []), ...(domain ? [{ domain }] : [])];
    if (!clauses.length) return { suppressed: false };
    const match = await prisma.suppressionEntry.findFirst({ where: { workspaceId, OR: clauses } });
    return match ? { suppressed: true, reason: match.email ? 'email_suppressed' : 'domain_suppressed' } : { suppressed: false };
  }
}
