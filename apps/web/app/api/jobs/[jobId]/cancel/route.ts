import { NextRequest, NextResponse } from 'next/server';
import { JobService } from '@/server/services/JobService';
import { AuditLogService } from '@/server/services/AuditLogService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { prisma } from '@packages/db';

const jobService = new JobService();
const auditLogService = new AuditLogService();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await req.json();
    const { source } = body; // 'web' or 'telegram'
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const ownedJob = await prisma.job.findFirst({ where: { id: jobId, workspaceId } });
    if (!ownedJob) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const job = await jobService.requestCancellation(jobId);

    await auditLogService.log({
      workspaceId: job.workspaceId,
      entityType: 'job',
      entityId: jobId,
      action: source === 'telegram' ? 'telegram_cancel_requested' : 'web_cancel_requested',
      details: { jobId, source }
    });

    return NextResponse.json({ 
      status: 'success', 
      message: 'Cancellation requested',
      jobStatus: job.status
    });
  } catch (error: any) {
    console.error('Cancellation failed:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: securityErrorStatus(error) });
  }
}
