import { prisma } from '@packages/db';

export interface WorkerExecutePayload {
  workspaceId: string;
  commandId: string;
  jobId: string;
  message: string;
  mockMode?: boolean;
}

export class WorkerClient {
  private workerUrl: string;

  constructor() {
    this.workerUrl = process.env.WORKER_URL || 'http://localhost:8000';
  }

  async executeCommand(payload: WorkerExecutePayload) {
    try {
      const response = await fetch(`${this.workerUrl}/commands/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: payload.workspaceId,
          command_id: payload.commandId,
          job_id: payload.jobId,
          message: payload.message,
          mock_mode: payload.mockMode ?? (process.env.MOCK_MODE === 'true')
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Worker API responded with ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('WorkerClient Error:', error);
      
      // Update Job status to failed if we can't even reach the worker
      await prisma.job.update({
        where: { id: payload.jobId },
        data: { 
          status: 'failed', 
          failedReason: `Failed to trigger worker: ${error.message}`,
          updatedAt: new Date()
        }
      });

      await prisma.jobLog.create({
        data: {
          jobId: payload.jobId,
          level: 'error',
          message: `Network/Worker Error: ${error.message}`
        }
      });

      throw error;
    }
  }

  async checkStatus() {
    try {
      const response = await fetch(`${this.workerUrl}/`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}
