import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { DomainGuardService } from '@/server/services/DomainGuardService';
import { readSessionUserId, requireWorkspace, securityErrorStatus } from '@/server/security/request';
import { checkRateLimit } from '@/server/security/rate-limit';
import { JobService } from '@/server/services/JobService';

const domainGuard = new DomainGuardService();

/**
 * POST /api/chat/command
 * Orchestrates user prompt understanding and plan creation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, skipExecution } = body;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const workspaceId = requireWorkspace(req, body.workspaceId);

    if (!prompt || prompt.length > 4000 || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!checkRateLimit(`command:${workspaceId}`, 20, 60_000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    const session = await prisma.chatSession.findFirst({ where: { id: sessionId, workspaceId } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const userId = readSessionUserId(req);
    const userProfile = userId
      ? await prisma.user.findFirst({
          where: { id: userId, workspaces: { some: { workspaceId } } },
          select: { name: true, email: true, jobTitle: true, companyName: true, homeCountry: true },
        })
      : null;

    // 1. Check Domain Guardrail
    // Note: The user message is already saved by the frontend via /api/chat/messages
    // before this endpoint is called. Do NOT save it again here.
    const guardResult = await domainGuard.classifyIntent(prompt);

    if (!guardResult.allowed) {
      const blockedMessage = await prisma.chatMessage.create({
        data: {
          sessionId,
          role: 'assistant',
          content: guardResult.message || 'I’m focused on outreach tasks only.',
          type: 'text',
        },
      });

      return NextResponse.json({
        message: blockedMessage,
        allowed: false,
        intent: 'out_of_scope'
      });
    }

    // 3. Call Python Worker (CommandUnderstandingAgent)
    const workerUrl = process.env.WORKER_URL || 'http://localhost:8000';
    let plan = null;

    try {
      const response = await fetch(`${workerUrl}/commands/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          userProfile,
        }),
      });

      if (!response.ok) {
        throw new Error(`Worker returned ${response.status}`);
      }

      plan = await response.json();

    } catch (e: any) {
      console.error('Worker planning failed:', e);

      if (process.env.MOCK_MODE === 'true') {
        plan = {
          allowed: true,
          intent: prompt.includes('Send') ? 'send_emails' : 'scrape_leads',
          command_type: prompt.includes('Send') ? 'send_approved_emails' : 'scrape_leads',
          goal: `Process request: ${prompt}`,
          parameters: { industry: "Salons", location: "Sydney", quantity: 5 },
          intent_flags: { drafting_requested: true, sending_requested: false, approval_required: true },
          steps: ["Initialize Scraper", "Search URLs", "Extract Leads", "Dedupe Results"],
          safety_checks: ["Backend dedupe", "Suppression check"]
        };
      } else {
        return NextResponse.json({ 
          error: 'AI Planning Service is currently unavailable. Please try again later.',
          details: e.message
        }, { status: 503 });
      }
    }

    // 4. If the agent itself returned not allowed (double check after DomainGuard)
    if (plan && plan.allowed === false) {
      const blockedMessage = await prisma.chatMessage.create({
        data: {
          sessionId,
          role: 'assistant',
          content: plan.message || 'I’m focused on outreach tasks only.',
          type: 'text',
        },
      });

      return NextResponse.json({
        message: blockedMessage,
        allowed: false,
        intent: 'out_of_scope'
      });
    }

    // 5. Save command/plan to DB
    const normalizedParameters = plan.parameters || {
      industry: plan.industry,
      location: plan.location,
      quantity: plan.quantity,
    };
    const command = await prisma.userCommand.create({
      data: {
        sessionId,
        rawPrompt: prompt,
        commandType: plan.intent || plan.command_type,
        status: 'APPROVED',
        plan,
        commandPlan: {
          create: {
            workspaceId,
            intent: plan.intent || plan.command_type,
            goal: plan.goal || prompt,
            parameters: normalizedParameters,
            steps: plan.steps || [],
            safetyChecks: plan.safety_checks || [],
          }
        }
      },
    });

    if (skipExecution) {
      return NextResponse.json({
        commandId: command.id,
        plan: plan,
        allowed: true
      });
    }

    // Cancel any existing active jobs (pending or running) in this workspace
    // to prevent queue blockages and ensure the new prompt runs immediately.
    try {
      const activeJobs = await prisma.job.findMany({
        where: {
          workspaceId,
          status: { in: ['pending', 'running'] }
        }
      });
      const jobService = new JobService();
      for (const activeJob of activeJobs) {
        console.log(`Cancelling active job ${activeJob.id} before triggering new job`);
        await jobService.requestCancellation(activeJob.id);
      }
    } catch (cancelError) {
      console.error('Failed to cancel active jobs:', cancelError);
    }

    // 6. Automatically start the job and trigger worker
    const jobService = new JobService();
    const jobName = `Job for: ${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}`;
    const job = await jobService.createJob(workspaceId, command.id, jobName);
    
    try {
      await jobService.startWorkerJob(job, prompt, userId || undefined);
    } catch (workerError: any) {
      console.error('Failed to trigger worker automatically:', workerError);
      await jobService.updateJobStatus(job.id, 'failed', 0);
      return NextResponse.json({ 
        error: 'Worker failed to start', 
        details: workerError.message,
        jobId: job.id 
      }, { status: 502 });
    }

    // 7. Create an assistant message with type "job_progress" instead of "command_plan"
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: `Execution initiated. I'm deploying the swarm to process your request.`,
        type: 'job_progress',
        metadata: {
          jobId: job.id,
          jobName: job.name,
          steps: plan.steps || [],
          progress: 0,
          country: normalizedParameters.country || null,
        },
      },
    });

    return NextResponse.json({
      message: assistantMessage,
      commandId: command.id,
      jobId: job.id,
      plan: plan
    });

  } catch (error: any) {
    console.error('Command API Error:', error);
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}
