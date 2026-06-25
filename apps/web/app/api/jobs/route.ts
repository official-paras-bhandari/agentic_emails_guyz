import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { JobService } from '@/server/services/JobService';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { checkRateLimit } from '@/server/security/rate-limit';

const jobService = new JobService();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { commandId, prompt, userId } = body;
    const workspaceId = requireWorkspace(req, body.workspaceId);

    if (!commandId || !workspaceId || !prompt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Get the command to ensure it exists and matches
    if (!checkRateLimit(`jobs:${workspaceId}`, 10, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const dailyCount = await prisma.job.count({ where: { workspaceId, createdAt: { gte: startOfDay } } });
    const dailyLimit = Number(process.env.DAILY_JOB_LIMIT || 100);
    if (dailyCount >= dailyLimit) return NextResponse.json({ error: 'Daily job limit reached' }, { status: 429 });
    const command = await prisma.userCommand.findFirst({
      where: { id: commandId, session: { workspaceId } }
    });

    if (!command) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }

    // 2. Create Job in DB first
    const jobName = `Job for: ${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}`;
    const job = await jobService.createJob(workspaceId, commandId, jobName);

    // 3. Update command status
    await prisma.userCommand.update({
      where: { id: commandId },
      data: { status: 'APPROVED' }
    });

    // 4. Trigger Worker
    try {
      await jobService.startWorkerJob(job, prompt, userId);
    } catch (workerError: any) {
      console.error('Failed to trigger worker:', workerError);
      // Even if worker fails, we have the job record. 
      // We could mark it as failed immediately or let it stay pending.
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
      message: 'Job started successfully'
    });

  } catch (error: any) {
    console.error('API Error /api/jobs:', error);
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = requireWorkspace(req, searchParams.get('workspaceId'));

    const jobs = await prisma.job.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { steps: true }
    });

    return NextResponse.json(jobs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}
