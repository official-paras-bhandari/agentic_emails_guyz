import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { JobService } from '@/server/services/JobService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

const jobService = new JobService();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaignId, businessWebsite } = body;
    const workspaceId = requireWorkspace(req, body.workspaceId);

    if (!campaignId || !businessWebsite) {
      return NextResponse.json({ error: 'campaignId and businessWebsite are required' }, { status: 400 });
    }

    // 1. Verify campaign exists and belongs to the workspace
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId }
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // 2. Create Job in DB (commandId is null)
    const jobName = `Analyze Business: ${businessWebsite.substring(0, 30)}${businessWebsite.length > 30 ? '...' : ''}`;
    const job = await jobService.createJob(workspaceId, null, jobName);

    // 3. Prepare the prompt as JSON for worker
    const prompt = JSON.stringify({
      intent: 'analyze_business',
      campaign_id: campaignId,
      businessWebsite: businessWebsite
    });

    // 4. Trigger Worker
    try {
      await jobService.startWorkerJob(job, prompt);
    } catch (workerError: any) {
      console.error('Failed to trigger worker:', workerError);
      await jobService.updateJobStatus(job.id, 'failed', 0);
      return NextResponse.json({
        error: 'Worker failed to start',
        details: workerError.message,
        jobId: job.id
      }, { status: 502 });
    }

    return NextResponse.json({
      status: 'success',
      jobId: job.id,
      message: 'Analysis job started successfully'
    });

  } catch (error: any) {
    console.error('API Error /api/campaigns/analyze:', error);
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}
