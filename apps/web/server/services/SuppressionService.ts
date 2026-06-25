import { prisma } from '@packages/db';
import { normalizeDomain, normalizeEmail } from '../security/request';
import { AuditLogService } from './AuditLogService';

const audit = new AuditLogService();

export class SuppressionService {
  async add(workspaceId: string, input: { email?: string | null; domain?: string | null; reason?: string; source?: string; leadId?: string }) {
    const email = normalizeEmail(input.email);
    const domain = normalizeDomain(input.domain);
    if (!email && !domain) throw new Error('A valid email or domain is required');
    const entry = email
      ? await prisma.suppressionEntry.upsert({
          where: { workspaceId_email: { workspaceId, email } },
          update: { reason: input.reason, source: input.source },
          create: { workspaceId, email, reason: input.reason, source: input.source },
        })
      : await prisma.suppressionEntry.upsert({
          where: { workspaceId_domain: { workspaceId, domain: domain! } },
          update: { reason: input.reason, source: input.source },
          create: { workspaceId, domain, reason: input.reason, source: input.source },
        });

    const leadWhere = input.leadId ? { id: input.leadId, workspaceId } : {
      workspaceId,
      OR: [...(email ? [{ email }] : []), ...(domain ? [{ normalizedDomain: domain }] : [])],
    };
    const leads = await prisma.lead.findMany({ where: leadWhere, select: { id: true } });
    const leadIds = leads.map(lead => lead.id);
    if (leadIds.length) {
      await prisma.$transaction([
        prisma.lead.updateMany({ where: { id: { in: leadIds }, workspaceId }, data: { status: 'unsubscribed' } }),
        prisma.sendQueue.updateMany({ where: { workspaceId, draft: { leadId: { in: leadIds } }, status: { in: ['pending', 'checking_rules', 'queued', 'sending'] } }, data: { status: 'cancelled', errorReason: 'suppressed' } }),
        prisma.followUpTask.updateMany({ where: { workspaceId, leadId: { in: leadIds }, status: { in: ['scheduled', 'ready', 'processing'] } }, data: { status: 'cancelled' } }),
      ]);
    }
    await audit.log({ workspaceId, entityType: 'SuppressionEntry', entityId: entry.id, action: 'suppression_added', details: { email, domain, reason: input.reason, source: input.source } });
    return entry;
  }

  list(workspaceId: string) {
    return prisma.suppressionEntry.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  }

  async remove(workspaceId: string, id: string, confirmed: boolean) {
    if (!confirmed) throw new Error('Explicit confirmation is required');
    const entry = await prisma.suppressionEntry.findFirst({ where: { id, workspaceId } });
    if (!entry) throw new Error('Suppression entry not found');
    await prisma.suppressionEntry.delete({ where: { id } });
    await audit.log({ workspaceId, entityType: 'SuppressionEntry', entityId: id, action: 'suppression_removed', details: { email: entry.email, domain: entry.domain } });
  }
}
