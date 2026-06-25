import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../packages/db/node_modules/@prisma/client');
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const headers = { 'content-type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY };
const assert = (value, message) => { if (!value) throw new Error(message); };
async function post(path, workspaceId, body = {}, expected) {
  const response = await fetch(base + path, { method: 'POST', headers, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ ...body, workspaceId }) });
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
  const workspaceId = `ws_send_${Date.now().toString(36)}`;
  await prisma.workspace.create({ data: { id: workspaceId, name: 'Send tests' } });
  await prisma.workspaceSetting.create({ data: { workspaceId, dailySendLimit: 10, delaySeconds: 0 } });
  const campaign = (await post('/api/campaigns', workspaceId, { name: 'Send test' })).data;
  const create = async number => {
    const lead = (await post('/api/leads', workspaceId, { email: `send-${workspaceId}-${number}@example.com`, businessName: `Send ${number}`, website: `https://send-${number}.example.com` })).data;
    await post(`/api/campaigns/${campaign.id}/leads`, workspaceId, { leadId: lead.id });
    const draft = (await post('/api/drafts', workspaceId, { leadId: lead.id, campaignId: campaign.id, subject: `Hello ${number}`, body: 'Grounded test body', verificationScore: 0.9 })).data;
    return { lead, draft };
  };

  const blocked = await create(1);
  const deliverable = await create(2);
  await fetch(`${base}/api/campaigns/${campaign.id}`, { method: 'PATCH', headers, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ workspaceId, status: 'active' }) });
  await post(`/api/drafts/${blocked.draft.id}/approve`, workspaceId);
  const duplicate = await post('/api/send', workspaceId, { draftId: blocked.draft.id }, 409);
  assert(duplicate.data.error === 'send_already_queued', 'duplicate queue reason mismatch');
  await post('/api/unsubscribe', workspaceId, { leadId: blocked.lead.id, email: blocked.lead.email });
  const blockedQueue = await prisma.sendQueue.findUnique({ where: { draftId: blocked.draft.id } });
  assert(['blocked', 'cancelled'].includes(blockedQueue.status), 'unsubscribe did not stop queued send');

  await post(`/api/drafts/${deliverable.draft.id}/approve`, workspaceId);
  const processed = (await post('/api/send', workspaceId, { action: 'process' })).data;
  assert(processed.sent === 1, 'mock Gmail send did not complete');
  const sent = await prisma.sentEmail.findFirst({ where: { workspaceId, leadId: deliverable.lead.id } });
  assert(sent?.deliveryStatus === 'sent' && sent.messageId, 'sent email identifiers were not persisted');
  const followup = await prisma.followUpTask.findFirst({ where: { workspaceId, leadId: deliverable.lead.id } });
  assert(followup?.stepNumber === 1 && followup.status === 'scheduled', 'first follow-up was not scheduled');

  await prisma.followUpTask.update({ where: { id: followup.id }, data: { scheduledFor: new Date(Date.now() - 1_000) } });
  const followupDispatch = await post('/api/follow-ups', workspaceId, {});
  assert(followupDispatch.data.dispatched === 1, 'due follow-up was not dispatched');

  const processingTask = await prisma.followUpTask.findUnique({ where: { id: followup.id } });
  assert(processingTask?.status === 'processing', 'follow-up task did not enter processing');

  const followupJob = await prisma.job.findFirst({
    where: { workspaceId, name: 'Follow-up step 1' },
    orderBy: { createdAt: 'desc' },
  });
  assert(followupJob?.id, 'follow-up job was not created');

  await postWorkerWebhook('draft_created', {
    job_id: followupJob.id,
    workspace_id: workspaceId,
    lead_id: deliverable.lead.id,
    campaign_id: campaign.id,
    subject: 'Re: Hello 2',
    body: 'Quick follow-up body',
    verification_score: 0.85,
    verification_reasons: ['Follow-up step 1 generated in test'],
    followup_task_id: followup.id,
    is_followup: true,
  });

  const followupDraft = await prisma.emailDraft.findFirst({
    where: { workspaceId, leadId: deliverable.lead.id, id: { not: deliverable.draft.id } },
    include: { versions: true, sendQueue: true },
    orderBy: { createdAt: 'desc' },
  });
  assert(followupDraft?.versions[0]?.followupNumber === 1, 'follow-up draft was not tagged as step 1');
  assert(followupDraft?.sendQueue, 'follow-up draft was not queued for sending');

  const followupSend = (await post('/api/send', workspaceId, { action: 'process' })).data;
  assert(followupSend.sent === 1, 'follow-up draft was not sent');

  const allSent = await prisma.sentEmail.findMany({ where: { workspaceId, leadId: deliverable.lead.id }, orderBy: { sentAt: 'asc' } });
  assert(allSent.length === 2, 'follow-up send did not create a second sent email');

  const completedTask = await prisma.followUpTask.findUnique({ where: { id: followup.id } });
  assert(completedTask?.status === 'completed', 'follow-up task was not completed after webhook');
  const nextFollowup = await prisma.followUpTask.findFirst({ where: { workspaceId, leadId: deliverable.lead.id, stepNumber: 2 } });
  assert(nextFollowup?.status === 'scheduled', 'second follow-up was not scheduled after sending step 1');

  await post('/api/send', workspaceId, { draftId: deliverable.draft.id });
  const repeat = (await post('/api/send', workspaceId, { action: 'process' })).data;
  const queue = await prisma.sendQueue.findUnique({ where: { draftId: deliverable.draft.id } });
  assert(repeat.blocked === 1 && queue.errorReason === 'already_sent_recently', '24-hour repeat send was not blocked');
  console.log(JSON.stringify({ status: 'passed', workspaceId, messageId: sent.messageId, followupStep: followup.stepNumber, sentCount: allSent.length }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
