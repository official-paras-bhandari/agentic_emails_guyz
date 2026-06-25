import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { CampaignService } from '@/server/services/CampaignService';
import { JobService } from '@/server/services/JobService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function POST(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    const { campaignId } = await params;
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    
    // Check if campaign is active
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId }
    });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const campaignLead = await new CampaignService().addLead(workspaceId, campaignId, body.leadId);

    if (campaign.status === 'active') {
      const jobService = new JobService();
      const jobName = `Draft Campaign Emails (New Leads): ${campaign.name}`;
      const job = await jobService.createJob(workspaceId, null, jobName);
      
      const prompt = JSON.stringify({
        intent: 'draft_emails',
        campaign_id: campaignId
      });

      try {
        await jobService.startWorkerJob(job, prompt);
      } catch (workerError: any) {
        console.error('Failed to trigger campaign drafting worker for new lead:', workerError);
        await jobService.updateJobStatus(job.id, 'failed', 0);
      }
    }

    return NextResponse.json(campaignLead, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: error instanceof Error && error.message.includes('_') ? 409 : securityErrorStatus(error) }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    const { campaignId } = await params;
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const leadId = body.leadId;

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
    });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const campaignLead = await prisma.campaignLead.findUnique({
      where: { campaignId_leadId: { campaignId, leadId } },
    });

    if (!campaignLead) {
      return NextResponse.json({ error: 'Lead not found in campaign' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.sendQueue.updateMany({
        where: {
          workspaceId,
          draft: { campaignId, leadId },
          status: { in: ['pending', 'queued', 'checking_rules', 'sending'] },
        },
        data: { status: 'cancelled', errorReason: 'removed_from_campaign', leaseOwner: null, leaseExpiresAt: null },
      });

      await tx.followUpTask.updateMany({
        where: {
          workspaceId,
          campaignId,
          leadId,
          status: { in: ['scheduled', 'ready', 'processing'] },
        },
        data: { status: 'cancelled' },
      });

      await tx.campaignLead.delete({ where: { campaignId_leadId: { campaignId, leadId } } });
    });

    return NextResponse.json({ success: true, campaignId, leadId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
