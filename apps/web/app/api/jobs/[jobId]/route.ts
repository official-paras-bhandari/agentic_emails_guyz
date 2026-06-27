import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { withTenantContext, securityErrorStatus } from '@/server/security/request';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const workspaceId = req.nextUrl.searchParams.get('workspaceId');

    return await withTenantContext(req, workspaceId, async ({ prisma: tenantPrisma }) => {
      const job = await tenantPrisma.job.findFirst({
        where: { id: jobId, workspaceId },
        include: {
          steps: true,
          jobLogs: {
            orderBy: { createdAt: 'asc' }
          },
          workspace: true
        }
      });

      if (!job) {
        return NextResponse.json({ status: 'error', message: 'Job not found' }, { status: 404 });
      }

      const leads = await tenantPrisma.lead.findMany({
        where: {
          workspaceId: job.workspaceId,
          sources: { some: { jobId: job.id } },
          status: { not: 'duplicate' }
        },
        include: {
          sources: {
            orderBy: { createdAt: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const duplicateLogs = await tenantPrisma.jobLog.findMany({
        where: {
          jobId: job.id,
          message: { contains: 'Duplicate' }
        }
      });

      const synthesizedDuplicates = duplicateLogs.map(log => {
        const data = log.data as any;
        return {
          id: `dup-${log.id}`,
          businessName: data?.business_name || 'Duplicate',
          email: data?.email || null,
          website: data?.website_url || null,
          suburb: data?.suburb || null,
          status: 'duplicate',
          qualityScore: 0,
          sourceUrl: data?.source_url || data?.website_url,
          createdAt: log.createdAt
        };
      });

      const rawLeads = [...leads.map(l => ({
        id: l.id,
        businessName: l.businessName,
        email: l.email,
        website: l.website,
        suburb: l.suburb,
        status: l.status,
        qualityScore: l.qualityScore || 0,
        sourceUrl: l.sources[0]?.url,
        createdAt: l.createdAt
      })), ...synthesizedDuplicates].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const uniqueLeadsMap = new Map<string, any>();
      for (const lead of rawLeads) {
        let key = '';
        if (lead.email) {
          key = `email-${lead.email.toLowerCase().trim()}`;
        } else if (lead.website) {
          key = `website-${lead.website.toLowerCase().trim()}`;
        } else {
          const normalizedName = (lead.businessName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const normalizedSuburb = (lead.suburb || '').toLowerCase().trim();
          key = `name-${normalizedName}-${normalizedSuburb}`;
        }

        const existingLead = uniqueLeadsMap.get(key);
        if (!existingLead) {
          uniqueLeadsMap.set(key, lead);
        } else {
          if (lead.status !== 'duplicate' && existingLead.status === 'duplicate') {
            uniqueLeadsMap.set(key, lead);
          }
        }
      }
      const allLeads = Array.from(uniqueLeadsMap.values());

      const isMockMode = job.jobLogs.some(l => (l.data as any)?.mock_mode === true || l.message.includes('[MOCK]'));

      return NextResponse.json({
        job: {
          id: job.id,
          status: job.status,
          progress: job.progress,
          commandId: job.commandId,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          failedReason: job.failedReason,
          isMockMode
        },
        steps: job.steps.map(s => ({
          id: s.id,
          name: s.name,
          status: s.status,
          startedAt: s.startedAt,
          completedAt: s.completedAt
        })),
        logs: job.jobLogs.map(l => ({
          id: l.id,
          level: l.level,
          message: l.message,
          data: l.data,
          createdAt: l.createdAt
        })),
        leads: allLeads,
        stats: {
          found: leads.filter(l => l.sources[0]?.jobId === job.id).length + synthesizedDuplicates.length,
          saved: leads.filter(l => l.sources[0]?.jobId === job.id).length,
          duplicatesSkipped: synthesizedDuplicates.length,
          failedUrls: job.jobLogs.filter(l => l.level === 'error' && l.message.includes('failed')).length
        }
      });
    });
  } catch (error: any) {
    console.error('Job Detail API Error:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: securityErrorStatus(error) });
  }
}
