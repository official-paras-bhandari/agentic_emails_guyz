import { prisma } from '@packages/db';
import { WorkerClient } from './WorkerClient';

export class JobService {
  async createJob(workspaceId: string, commandId: string | null, name: string) {
    return await prisma.job.create({
      data: {
        workspaceId,
        commandId,
        name,
        status: 'pending',
        progress: 0,
        steps: {
          create: [
            { name: 'understanding', status: 'pending' },
            { name: 'searching', status: 'pending' },
            { name: 'extracting', status: 'pending' }
          ]
        }
      },
      include: { steps: true }
    });
  }

  async startWorkerJob(job: any, prompt: string, userId?: string) {
    const workerUrl = process.env.WORKER_URL || 'http://localhost:8000';
    const payload = {
      command_id: job.commandId,
      workspace_id: job.workspaceId,
      user_id: userId,
      job_id: job.id,
      message: prompt,
      mock_mode: process.env.MOCK_MODE === 'true'
    };

    const response = await fetch(`${workerUrl}/commands/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.INTERNAL_API_KEY ? { 'X-Internal-Api-Key': process.env.INTERNAL_API_KEY } : {}) },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Worker failed: ${errorText}`);
    }

    return await response.json();
  }

  async updateJobStatus(jobId: string, status: string, progress: number) {
    // If the job is already cancelled or cancellation_requested, 
    // we should be careful about moving it to other statuses except 'cancelled' or 'failed'
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (job && (job.status === 'cancelled' || job.status === 'cancellation_requested') && status !== 'cancelled' && status !== 'failed') {
      console.log(`Ignoring status update to ${status} for job ${jobId} because it is ${job.status}`);
      return job;
    }

    return await prisma.job.update({
      where: { id: jobId },
      data: { status, progress }
    });
  }

  async requestCancellation(jobId: string) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Job not found');
    
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return job; // Already in a final state
    }

    // Mark job as cancellation_requested
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: { status: 'cancellation_requested' }
    });

    // Cancel associated command if it exists and is not completed
    if (job.commandId) {
      await prisma.userCommand.updateMany({
        where: { id: job.commandId, status: { in: ['PENDING', 'PLANNING', 'APPROVED'] } },
        data: { status: 'CANCELLED' }
      });
    }

    return updatedJob;
  }

  async failStaleJobs(staleAfterMinutes = 30) {
    const cutoff = new Date(Date.now() - staleAfterMinutes * 60_000);
    const stale = await prisma.job.findMany({ where: { status: { in: ['pending', 'running'] }, OR: [{ lastHeartbeatAt: { lt: cutoff } }, { lastHeartbeatAt: null, updatedAt: { lt: cutoff } }] } });
    for (const job of stale) {
      await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', failedReason: 'Worker heartbeat timed out' } });
      await prisma.jobLog.create({ data: { jobId: job.id, level: 'error', message: 'Worker heartbeat timed out' } });
    }
    return stale.length;
  }

  async addStep(jobId: string, name: string) {
    return await prisma.jobStep.create({
      data: {
        jobId,
        name,
        status: 'pending'
      }
    });
  }

  async updateStep(stepId: string, status: string, logs?: string) {
    return await prisma.jobStep.update({
      where: { id: stepId },
      data: { 
        status, 
        logs,
        startedAt: status === 'running' ? new Date() : undefined,
        completedAt: ['completed', 'failed', 'cancelled'].includes(status) ? new Date() : undefined
      }
    });
  }
}
