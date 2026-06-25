import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { JobService } from '@/server/services/JobService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

type Context = { params: Promise<{ campaignId: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { campaignId } = await params;
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: {
        campaignLeads: { include: { lead: true } },
        drafts: true,
        followUpTasks: true,
        campaignMemories: true
      }
    });
    return campaign ? NextResponse.json(campaign) : NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) });
  }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const { campaignId } = await params;
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    
    const exists = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId }
    });
    if (!exists) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    
    const allowed = ['draft', 'active', 'paused', 'completed', 'cancelled'];
    const statusTransitionToActive = body.status === 'active' && exists.status !== 'active';
    
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        name: body.name,
        status: body.status && allowed.includes(body.status) ? body.status : undefined,
        verificationMode: ['auto_verify', 'remove_control'].includes(body.verificationMode) ? body.verificationMode : undefined,
        dailySendLimit: body.dailySendLimit,
        autoFollowUp: body.autoFollowUp
      }
    });

    let activeJobId: string | null = null;
    if (statusTransitionToActive) {
      const jobService = new JobService();
      const jobName = `Draft Campaign Emails: ${updatedCampaign.name}`;
      const job = await jobService.createJob(workspaceId, null, jobName);
      activeJobId = job.id;

      const prompt = JSON.stringify({
        intent: 'draft_emails',
        campaign_id: campaignId
      });

      try {
        await jobService.startWorkerJob(job, prompt);
      } catch (workerError: any) {
        console.error('Failed to trigger campaign drafting worker:', workerError);
        await jobService.updateJobStatus(job.id, 'failed', 0);
      }
    }

    return NextResponse.json({ ...updatedCampaign, activeJobId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) });
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { campaignId } = await params;
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req, body.workspaceId);

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: {
        drafts: { select: { id: true } },
        campaignLeads: { select: { leadId: true } },
        followUpTasks: { select: { id: true } },
        campaignMemories: { select: { id: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.sendQueue.updateMany({
        where: { workspaceId, draft: { campaignId } },
        data: { status: 'cancelled', errorReason: 'campaign_deleted', leaseOwner: null, leaseExpiresAt: null },
      });

      await tx.followUpTask.deleteMany({ where: { workspaceId, campaignId } });
      await tx.campaignLead.deleteMany({ where: { campaignId } });
      await tx.campaignMemory.deleteMany({ where: { campaignId } });
      await tx.emailDraft.deleteMany({ where: { workspaceId, campaignId } });
      await tx.campaign.delete({ where: { id: campaignId } });
    });

    return NextResponse.json({
      success: true,
      deletedCampaignId: campaignId,
      deletedDrafts: campaign.drafts.length,
      deletedLeads: campaign.campaignLeads.length,
      deletedFollowUps: campaign.followUpTasks.length,
      deletedMemories: campaign.campaignMemories.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) });
  }
}
