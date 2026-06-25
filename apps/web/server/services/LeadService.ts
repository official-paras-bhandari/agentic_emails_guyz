import { prisma } from '@packages/db';
import { normalizeDomain, normalizeEmail, normalizePhone } from '../security/request';
import { SuppressionService } from './SuppressionService';

export class LeadService {
  async saveLead(data: { workspaceId: string; email?: string; businessName?: string; website?: string; phone?: string; suburb?: string }) {
    const email = normalizeEmail(data.email);
    if (email) return prisma.lead.upsert({
      where: { workspaceId_email: { workspaceId: data.workspaceId, email } },
      update: { businessName: data.businessName, website: data.website, normalizedDomain: normalizeDomain(data.website), phone: data.phone, normalizedPhone: normalizePhone(data.phone), suburb: data.suburb },
      create: { workspaceId: data.workspaceId, email, businessName: data.businessName, website: data.website, normalizedDomain: normalizeDomain(data.website), phone: data.phone, normalizedPhone: normalizePhone(data.phone), suburb: data.suburb },
    });
    return prisma.lead.create({ data: { workspaceId: data.workspaceId, businessName: data.businessName, website: data.website, normalizedDomain: normalizeDomain(data.website), phone: data.phone, normalizedPhone: normalizePhone(data.phone), suburb: data.suburb } });
  }

  getLeadsByStatus(workspaceId: string, status: string) { return prisma.lead.findMany({ where: { workspaceId, status } }); }

  async unsubscribeLead(workspaceId: string, email: string, reason?: string) {
    return new SuppressionService().add(workspaceId, { email, reason, source: 'lead_service' });
  }
}
