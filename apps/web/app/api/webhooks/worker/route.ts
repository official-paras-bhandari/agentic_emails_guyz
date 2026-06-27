import { NextRequest, NextResponse } from 'next/server';
import { prisma, controlPrisma, getTenantPrismaForTenant, tenantPrismaStorage } from '@packages/db';
import { DedupeService } from '@/server/services/DedupeService';
import { ContactPolicyService } from '@/server/services/ContactPolicyService';
import { NotificationService } from '@/server/services/NotificationService';
import crypto from 'crypto';
import { normalizeDomain, normalizeEmail, normalizePhone } from '@/server/security/request';
import { DraftService } from '@/server/services/DraftService';
import { GoogleSheetsService } from '@/server/services/GoogleSheetsService';

const dedupeService = new DedupeService();
const contactPolicyService = new ContactPolicyService();
const notificationService = new NotificationService();
const draftService = new DraftService();
const googleSheetsService = new GoogleSheetsService();

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-webhook-signature');
    const timestamp = req.headers.get('x-webhook-timestamp');
    const secret = process.env.WEBHOOK_SECRET;

    if (!secret) {
      console.error('WEBHOOK_SECRET is not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!signature || !timestamp) {
      return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 401 });
    }

    const requestTime = Number(timestamp);
    if (!Number.isFinite(requestTime) || Math.abs(Math.floor(Date.now() / 1000) - requestTime) > 300) {
      return NextResponse.json({ error: 'Request expired' }, { status: 401 });
    }

    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
    const actual = Buffer.from(signature, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { type, data } = JSON.parse(rawBody);
    if (typeof type !== 'string' || !data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    const { job_id, workspace_id } = data;
    if (!job_id) {
      return NextResponse.json({ error: 'Missing job_id' }, { status: 400 });
    }

    // 1. Resolve workspace context from Control DB
    const workspaceId = workspace_id || data.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspace_id context' }, { status: 400 });
    }

    const ws = await controlPrisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { tenantId: true },
    });

    if (!ws || !ws.tenantId) {
      return NextResponse.json({ error: 'Workspace tenant routing not found in Control DB' }, { status: 400 });
    }

    const tenantPrisma = await getTenantPrismaForTenant(ws.tenantId);

    // 2. Execute webhook logic within the tenant's database context
    return await tenantPrismaStorage.run(tenantPrisma, async () => {
      // 3. Log the event to JobLog in Tenant DB
      const isError = type === 'job_failed' || data.status === 'error' || data.status === 'failed';
      await prisma.jobLog.create({
        data: {
          jobId: job_id,
          level: isError ? 'error' : 'info',
          message: data.message || `Event: ${type}`,
          data: data,
        },
      });

      // 4. Handle Event Types Scoped to Tenant DB
      switch (type) {
        case 'job_started':
          await prisma.job.update({
            where: { id: job_id },
            data: {
              status: 'running',
              workerId: data.worker_id,
              lastHeartbeatAt: new Date(),
              updatedAt: new Date(),
            },
          });
          break;

        case 'heartbeat':
          await prisma.job.update({
            where: { id: job_id },
            data: {
              lastHeartbeatAt: new Date(),
              updatedAt: new Date(),
            },
          });
          break;

        case 'step_started':
        case 'step_running':
          const existingJob = await prisma.job.findUnique({ where: { id: job_id }, include: { steps: true } });
          if (existingJob) {
            const stepName = data.step;
            const step = existingJob.steps.find(s => s.name === stepName);
            if (step) {
              await prisma.jobStep.update({
                where: { id: step.id },
                data: { status: 'running', logs: data.message, startedAt: new Date() },
              });
              // Auto-complete previous steps in the workflow sequence
              const stepOrder = ['understanding', 'searching', 'extracting'];
              const currentIdx = stepOrder.indexOf(stepName);
              if (currentIdx > 0) {
                const previousSteps = stepOrder.slice(0, currentIdx);
                await prisma.jobStep.updateMany({
                  where: { jobId: job_id, name: { in: previousSteps }, status: { not: 'completed' } },
                  data: { status: 'completed', completedAt: new Date() },
                });
              }
            }
          }
          break;

        case 'step_completed':
          await prisma.jobStep.updateMany({
            where: { jobId: job_id, name: data.step },
            data: { status: 'completed', logs: data.message, completedAt: new Date() },
          });
          break;

        case 'lead_found':
          await handleLeadFound(job_id, workspaceId, data);
          break;

        case 'draft_created':
          await handleDraftCreated(job_id, workspaceId, data);
          break;

        case 'lead_enriched':
          await handleLeadEnriched(job_id, data);
          break;

        case 'export_requested':
          try {
            await prisma.jobStep.updateMany({
              where: { jobId: job_id, name: 'exporting' },
              data: { status: 'running', startedAt: new Date() },
            });
            const job = await prisma.job.findUnique({ where: { id: job_id } });
            if (job) {
              const result = await googleSheetsService.exportLeadsToSheet(job.workspaceId);
              await prisma.jobLog.create({
                data: {
                  jobId: job_id,
                  level: 'info',
                  message: `Exported leads to Google Sheet: ${result.url}`,
                  data: { url: result.url },
                },
              });
            }
            await prisma.jobStep.updateMany({
              where: { jobId: job_id, name: 'exporting' },
              data: { status: 'completed', completedAt: new Date() },
            });
          } catch (error) {
            await prisma.jobLog.create({
              data: {
                jobId: job_id,
                level: 'error',
                message: `Export to Google Sheets failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            });
            await prisma.jobStep.updateMany({
              where: { jobId: job_id, name: 'exporting' },
              data: { status: 'failed', completedAt: new Date() },
            });
          }
          break;

        case 'business_analyzed':
          if (data.campaign_id) {
            const campaign = await prisma.campaign.findUnique({
              where: { id: data.campaign_id },
              select: { workspaceId: true },
            });
            if (campaign) {
              const campaignWorkspaceId = campaign.workspaceId;
              await prisma.campaign.update({
                where: { id: data.campaign_id },
                data: {
                  businessWebsite: data.business_website,
                  businessDescription: data.business_description,
                  targetPersona: data.target_persona,
                },
              });

              // Save business description to WorkspaceMemory
              if (data.business_description) {
                await prisma.workspaceMemory.create({
                  data: {
                    workspaceId: campaignWorkspaceId,
                    type: 'business_profile',
                    title: 'Business Description & Value Proposition',
                    content: data.business_description,
                    source: data.business_website || 'website_crawler',
                    confidence: 1.0,
                    isActive: true,
                  },
                });
              }

              // Save target persona to CampaignMemory
              if (data.target_persona) {
                await prisma.campaignMemory.create({
                  data: {
                    workspaceId: campaignWorkspaceId,
                    campaignId: data.campaign_id,
                    memoryType: 'target_persona',
                    content: data.target_persona,
                  },
                });
              }

              // Save each email template to CampaignMemory
              if (Array.isArray(data.email_templates)) {
                for (const tmpl of data.email_templates) {
                  await prisma.campaignMemory.create({
                    data: {
                      workspaceId: campaignWorkspaceId,
                      campaignId: data.campaign_id,
                      memoryType: 'email_template',
                      content: JSON.stringify(tmpl),
                    },
                  });
                }
              }
            }
          }
          await prisma.jobLog.create({
            data: {
              jobId: job_id,
              level: 'info',
              message: 'Business context analyzed successfully',
              data: data,
            },
          });
          break;

        case 'job_completed':
          await prisma.job.update({
            where: { id: job_id },
            data: { status: 'completed', progress: 100, updatedAt: new Date() },
          });
          await prisma.jobStep.updateMany({
            where: { jobId: job_id, status: { not: 'completed' } },
            data: { status: 'completed', completedAt: new Date() },
          });
          const completedJob = await prisma.job.findUnique({ where: { id: job_id } });
          if (completedJob) {
            await notificationService.notify(completedJob.workspaceId, {
              type: 'job_completed',
              data: { ...data, name: completedJob.name },
            });
          }
          break;

        case 'job_failed':
          await prisma.job.update({
            where: { id: job_id },
            data: {
              status: 'failed',
              failedReason: data.message,
              updatedAt: new Date(),
            },
          });
          await prisma.jobStep.updateMany({
            where: { jobId: job_id, status: 'running' },
            data: { status: 'failed', completedAt: new Date() },
          });

          await prisma.jobLog.create({
            data: {
              jobId: job_id,
              level: 'error',
              message: `Workflow Failed: ${data.message}`,
              data: data,
            },
          });
          break;

        case 'job_cancelled':
          await prisma.job.update({
            where: { id: job_id },
            data: { status: 'cancelled', updatedAt: new Date() },
          });
          break;

        case 'agent_event':
          await prisma.jobLog.create({
            data: {
              jobId: job_id,
              level: data.status === 'error' || data.status === 'failed' ? 'error' : 'info',
              message: data.message || `Agent step: ${data.step}`,
              data: data,
            },
          });

          if (data.step === 'lead_found') {
            await handleLeadFound(job_id, workspaceId, data);
          }
          if (data.step === 'completed') {
            await prisma.jobStep.updateMany({ where: { jobId: job_id, name: 'extracting' }, data: { status: 'completed', completedAt: new Date() } });
          }
          break;

        default:
          console.log(`Unhandled webhook event type: ${type}`);
      }

      return NextResponse.json({ status: 'success' });
    });
  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function handleDraftCreated(jobId: string, workspaceId: string, data: any) {
  try {
    const followupTask = data.followup_task_id
      ? await prisma.followUpTask.findFirst({
          where: { id: data.followup_task_id, workspaceId },
          select: { stepNumber: true },
        })
      : null;
    const draft = await draftService.createDraft({
      workspaceId,
      leadId: data.lead_id,
      campaignId: data.campaign_id || undefined,
      subject: data.subject,
      body: data.body,
      verificationScore: data.verification_score,
      verificationReasons: data.verification_reasons,
      createdBy: 'agent',
      followupNumber: followupTask?.stepNumber,
    });
    await prisma.jobLog.create({ data: { jobId, level: 'info', message: `Draft saved for lead ${data.lead_id}`, data: { draft_id: draft.id, lead_id: data.lead_id } } });

    if (data.followup_task_id) {
      await prisma.followUpTask.updateMany({
        where: { id: data.followup_task_id, workspaceId },
        data: { status: 'completed' },
      });
    }
  } catch (error) {
    if (data.followup_task_id) {
      await prisma.followUpTask.updateMany({
        where: { id: data.followup_task_id, workspaceId, status: 'processing' },
        data: { status: 'scheduled', scheduledFor: new Date(Date.now() + 30 * 60_000) },
      });
    }
    await prisma.jobLog.create({ data: { jobId, level: 'info', message: `Draft skipped for lead ${data.lead_id}: ${error instanceof Error ? error.message : 'policy_blocked'}`, data } });
  }
}

async function handleLeadEnriched(jobId: string, data: any) {
  try {
    await prisma.leadEnrichment.create({
      data: {
        leadId: data.lead_id,
        summary: data.summary,
        personalization: data.personalization,
        data: data.data || {},
      },
    });
    if (data.quality_score !== undefined && data.quality_score !== null) {
      await prisma.lead.update({
        where: { id: data.lead_id },
        data: { qualityScore: data.quality_score },
      });
    }
    await prisma.jobLog.create({
      data: {
        jobId,
        level: 'info',
        message: `Lead enriched for lead ${data.lead_id}`,
        data: { lead_id: data.lead_id },
      },
    });
  } catch (error) {
    console.error(`Failed to enrich lead ${data.lead_id}:`, error);
    await prisma.jobLog.create({
      data: {
        jobId,
        level: 'error',
        message: `Lead enrichment failed for lead ${data.lead_id || 'unknown'}: ${error instanceof Error ? error.message : 'unknown error'}`,
        data,
      },
    });
  }
}

async function handleLeadFound(jobId: string, workspaceId: string, data: any) {
  const {
    email,
    business_name,
    website_url,
    source_url,
    suburb,
    phone,
    address,
    services,
    page_type,
    extraction_location,
    extracted_fields,
    evidence,
  } = data;

  // 1. Policy check (Discovery)
  const canDiscover = await contactPolicyService.canDiscoverLead(workspaceId, {
    email,
    website: website_url,
  });

  if (!canDiscover.allowed) {
    await prisma.jobLog.create({
      data: {
        jobId,
        level: 'info',
        message: `Lead discovery blocked by policy: ${email || website_url} (${canDiscover.reason})`,
        data: { ...data, block_reason: canDiscover.reason },
      },
    });
    return;
  }

  // 2. Dedupe check
  const existing = await dedupeService.findExistingLead(workspaceId, {
    email,
    website: website_url,
    businessName: business_name,
    suburb,
    phone,
    sourceUrl: source_url,
  });

  if (existing) {
    await prisma.jobLog.create({
      data: {
        jobId,
        level: 'info',
        message: `Duplicate skipped: ${email || business_name} (${existing.reason})`,
        data: { ...data, step: 'duplicate_skipped', duplicate_reason: existing.reason, existing_lead_id: existing.lead.id },
      },
    });

    if (source_url) {
      const existingSource = await prisma.leadSource.findFirst({
        where: { leadId: existing.lead.id, url: source_url },
      });
      if (!existingSource) {
        await prisma.leadSource.create({
          data: {
            leadId: existing.lead.id,
            jobId,
            url: source_url,
            type: page_type || 'scrape',
            extractionLocation: extraction_location,
            scrapedAt: data.scraped_at ? new Date(data.scraped_at * 1000) : new Date(),
            confidenceScore: data.confidence_score,
            extractedFields: extracted_fields,
          },
        });
      }
    }
    return;
  }

  if (!source_url && !website_url) {
    await prisma.jobLog.create({ data: { jobId, level: 'error', message: 'Lead rejected: missing source URL', data } });
    return;
  }

  const newLead = await prisma.lead.create({
    data: {
      workspaceId,
      email: normalizeEmail(email),
      businessName: business_name,
      website: website_url,
      normalizedDomain: normalizeDomain(website_url),
      suburb: suburb,
      phone: phone,
      normalizedPhone: normalizePhone(phone),
      status: 'scraped',
      sources: {
        create: {
          jobId,
          url: source_url || website_url,
          type: page_type || 'scrape',
          extractionLocation: extraction_location,
          scrapedAt: data.scraped_at ? new Date(data.scraped_at * 1000) : new Date(),
          confidenceScore: data.confidence_score,
          extractedFields: extracted_fields,
        },
      },
      enrichments: {
        create: {
          summary: services ? `Services: ${Array.isArray(services) ? services.join(', ') : services}` : null,
          data: {
            address,
            services,
            evidence,
            extracted_fields,
            extraction_location,
            page_type,
          },
        },
      },
    },
  });

  await prisma.jobLog.create({
    data: {
      jobId,
      level: 'info',
      message: `Lead saved: ${email || business_name}`,
      data: { lead_id: newLead.id, email },
    },
  });
}
