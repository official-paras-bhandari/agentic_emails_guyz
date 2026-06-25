import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../packages/db/node_modules/@prisma/client');
const prisma = new PrismaClient();

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const headers = { 'content-type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY };
const assert = (value, message) => { if (!value) throw new Error(message); };

async function post(path, workspaceId, body = {}, expected) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ ...body, workspaceId }),
  });
  const data = await response.json();
  if (expected !== undefined) assert(response.status === expected, `${path}: expected ${expected}, received ${response.status}`);
  else if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
  return { status: response.status, data };
}

async function postWorkerWebhook(type, data) {
  const payload = JSON.stringify({ type, data });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = process.env.WEBHOOK_SECRET;
  assert(secret, 'WEBHOOK_SECRET is required');
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const response = await fetch(`${base}/api/webhooks/worker`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-timestamp': timestamp,
      'x-webhook-signature': signature,
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`/api/webhooks/worker: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const workspaceId = `ws_followup_${Date.now().toString(36)}`;
  await prisma.workspace.create({ data: { id: workspaceId, name: 'Follow-up regression tests' } });
  await prisma.workspaceSetting.create({ data: { workspaceId, dailySendLimit: 10, delaySeconds: 0 } });

  const campaign = (await post('/api/campaigns', workspaceId, { name: 'Follow-up regression' })).data;
  const lead = (await post('/api/leads', workspaceId, {
    email: `followup-${workspaceId}@example.com`,
    businessName: 'Follow-up Biz',
    website: `https://${workspaceId}.example.com`,
  })).data;
  await post(`/api/campaigns/${campaign.id}/leads`, workspaceId, { leadId: lead.id });
  await fetch(`${base}/api/campaigns/${campaign.id}`, {
    method: 'PATCH',
    headers,
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ workspaceId, status: 'active' }),
  });

  const initialDraft = (await post('/api/drafts', workspaceId, {
    leadId: lead.id,
    campaignId: campaign.id,
    subject: 'Initial outreach',
    body: 'Initial body',
    verificationScore: 0.9,
  })).data;

  await prisma.emailDraft.update({ where: { id: initialDraft.id }, data: { status: 'sent' } });
  await prisma.sentEmail.create({
    data: {
      workspaceId,
      leadId: lead.id,
      draftId: initialDraft.id,
      deliveryStatus: 'sent',
      sentAt: new Date(),
      messageId: `mock-initial-${workspaceId}`,
    },
  });

  const followUpTask = await prisma.followUpTask.create({
    data: {
      workspaceId,
      leadId: lead.id,
      campaignId: campaign.id,
      stepNumber: 1,
      status: 'processing',
      scheduledFor: new Date(Date.now() - 60_000),
    },
  });

  const followupJob = await prisma.job.create({
    data: {
      workspaceId,
      name: 'Follow-up step 1',
      status: 'queued',
      progress: 0,
      steps: { create: [{ name: 'followup', status: 'pending' }] },
    },
  });

  await postWorkerWebhook('draft_created', {
    job_id: followupJob.id,
    workspace_id: workspaceId,
    lead_id: lead.id,
    campaign_id: campaign.id,
    subject: 'Re: Initial outreach',
    body: 'Quick follow-up body',
    verification_score: 0.85,
    verification_reasons: ['Follow-up regression test'],
    followup_task_id: followUpTask.id,
    is_followup: true,
  });

  const followupDraft = await prisma.emailDraft.findFirst({
    where: { workspaceId, leadId: lead.id, id: { not: initialDraft.id } },
    include: { versions: true, sendQueue: true },
    orderBy: { createdAt: 'desc' },
  });
  assert(followupDraft, 'follow-up draft was not created');
  assert(followupDraft.versions[0]?.followupNumber === 1, 'follow-up version was not tagged with step number');
  assert(followupDraft.sendQueue, 'follow-up draft was not queued');

  const taskAfterWebhook = await prisma.followUpTask.findUnique({ where: { id: followUpTask.id } });
  assert(taskAfterWebhook?.status === 'completed', 'follow-up task was not completed by webhook handling');

  console.log(JSON.stringify({
    status: 'passed',
    workspaceId,
    followupDraftId: followupDraft.id,
    queuedStatus: followupDraft.sendQueue?.status,
    followupTaskStatus: taskAfterWebhook?.status,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
