import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, normalizeDomain, normalizeEmail, normalizePhone, securityErrorStatus } from '@/server/security/request';
import { DedupeService } from '@/server/services/DedupeService';

const dedupe = new DedupeService();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const { leads } = body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: 'leads array is required' }, { status: 400 });
    }

    let importedCount = 0;
    let skippedCount = 0;

    // Filter and sanitize leads, ensuring we have at least one identifying property
    const validLeadsToProcess: any[] = [];
    for (const leadData of leads) {
      const email = leadData.email ? normalizeEmail(leadData.email) : null;
      const website = leadData.website?.trim() || null;
      const businessName = leadData.businessName?.trim() || null;

      if (!businessName && !email && !website) {
        skippedCount++;
        continue;
      }
      validLeadsToProcess.push(leadData);
    }

    // Query all existing duplicates in a single batch
    const dedupeResults = await dedupe.findExistingLeadsBatch(workspaceId, validLeadsToProcess);

    // Keep track of normalized identifiers from leads imported during this batch
    // to prevent intra-batch duplication
    const importedEmails = new Set<string>();
    const importedDomains = new Set<string>();
    const importedPhones = new Set<string>();
    const importedBusinessSuburbs = new Set<string>();
    const importedUrls = new Set<string>();

    for (const leadData of validLeadsToProcess) {
      const email = leadData.email ? normalizeEmail(leadData.email) : null;
      const website = leadData.website?.trim() || null;
      const businessName = leadData.businessName?.trim() || null;
      const firstName = leadData.firstName?.trim() || null;
      const lastName = leadData.lastName?.trim() || null;
      const phone = leadData.phone?.trim() || null;
      const suburb = leadData.suburb?.trim() || null;
      const domain = website ? normalizeDomain(website) : null;
      const normalizedPh = phone ? normalizePhone(phone) : null;

      // 1. Check database duplicates from batch query
      const existing = dedupeResults.get(leadData);
      if (existing) {
        skippedCount++;
        continue;
      }

      // 2. Check intra-batch duplicates
      let isBatchDuplicate = false;
      if (email && importedEmails.has(email)) isBatchDuplicate = true;
      if (!isBatchDuplicate && domain && importedDomains.has(domain)) isBatchDuplicate = true;
      if (!isBatchDuplicate && normalizedPh && importedPhones.has(normalizedPh)) isBatchDuplicate = true;
      if (!isBatchDuplicate && businessName && suburb) {
        const key = `${businessName.toLowerCase()}|${suburb.toLowerCase()}`;
        if (importedBusinessSuburbs.has(key)) isBatchDuplicate = true;
      }
      if (!isBatchDuplicate && website && importedUrls.has(website)) isBatchDuplicate = true;

      if (isBatchDuplicate) {
        skippedCount++;
        continue;
      }

      // Register identifiers of current lead to prevent subsequent batch duplicates
      if (email) importedEmails.add(email);
      if (domain) importedDomains.add(domain);
      if (normalizedPh) importedPhones.add(normalizedPh);
      if (businessName && suburb) {
        importedBusinessSuburbs.add(`${businessName.toLowerCase()}|${suburb.toLowerCase()}`);
      }
      if (website) importedUrls.add(website);

      // Create new Lead
      const sourceUrl = website;
      await prisma.lead.create({
        data: {
          workspaceId,
          email,
          businessName,
          website,
          normalizedDomain: domain,
          phone,
          normalizedPhone: normalizedPh,
          suburb,
          firstName,
          lastName,
          status: 'new',
          ...(sourceUrl ? {
            sources: {
              create: {
                url: sourceUrl,
                type: 'import',
                extractionLocation: 'manual'
              }
            }
          } : {})
        }
      });
      importedCount++;
    }

    return NextResponse.json({
      success: true,
      importedCount,
      skippedCount,
      message: `Import completed: ${importedCount} imported, ${skippedCount} skipped`
    });

  } catch (error: any) {
    console.error('API Error /api/leads/import:', error);
    return NextResponse.json(
      { error: error.message || 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
