import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../packages/db/node_modules/@prisma/client');
const prisma = new PrismaClient();

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3010';
const headers = { 'content-type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY };
const assert = (value, message) => { if (!value) throw new Error(message); };

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function post(path, workspaceId, body = {}, expected) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ ...body, workspaceId }),
  });
  const data = await response.json();
  if (expected !== undefined) assert(response.status === expected, `${path}: expected ${expected}, received ${response.status}`);
  else if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
  return { status: response.status, data };
}

async function patch(path, workspaceId, body = {}) {
  const response = await fetch(base + path, {
    method: 'PATCH',
    headers,
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ ...body, workspaceId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function waitFor(condition, label, attempts = 30, delayMs = 1_000) {
  for (let i = 0; i < attempts; i++) {
    const result = await condition();
    if (result) return result;
    await wait(delayMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  const workspaceId = `ws_followup_e2e_${Date.now().toString(36)}`;
  await prisma.workspace.create({ data: { id: workspaceId, name: 'Follow-up E2E Tests' } });
  await prisma.workspaceSetting.create({ data: { workspaceId, dailySendLimit: 20, delaySeconds: 0 } });

  const campaign = (await post('/api/campaigns', workspaceId, { name: 'Follow-up E2E' })).data;
  const lead = (await post('/api/leads', workspaceId, {
    email: `followup-e2e-${workspaceId}@example.com`,
    businessName: 'Follow-up E2E Biz',
    website: `https://${workspaceId}.example.com`,
  })).data;
  await post(`/api/campaigns/${campaign.id}/leads`, workspaceId, { leadId: lead.id });

  const draft = (await post('/api/drafts', workspaceId, {
    leadId: lead.id,
    campaignId: campaign.id,
    subject: 'Initial outreach',
    body: 'Initial grounded outreach body',
    verificationScore: 0.95,
  })).data;

  await patch(`/api/campaigns/${campaign.id}`, workspaceId, { status: 'active' });
  await post(`/api/drafts/${draft.id}/approve`, workspaceId);

  const firstSend = (await post('/api/send', workspaceId, { action: 'process' })).data;
  assert(firstSend.sent === 1, 'initial mock send did not complete');

  const initialTask = await waitFor(async () => {
    return prisma.followUpTask.findFirst({ where: { workspaceId, leadId: lead.id, stepNumber: 1 } });
  }, 'initial follow-up task');
  assert(initialTask.status === 'scheduled', 'follow-up step 1 was not scheduled');

  await prisma.followUpTask.update({ where: { id: initialTask.id }, data: { scheduledFor: new Date(Date.now() - 1_000) } });

  await fetch(`${base}/api/cron`, { method: 'GET', signal: AbortSignal.timeout(20_000) });

  await waitFor(async () => {
    const sentEmails = await prisma.sentEmail.count({ where: { workspaceId, leadId: lead.id } });
    const completedTask = await prisma.followUpTask.findUnique({ where: { id: initialTask.id } });
    const nextTask = await prisma.followUpTask.findFirst({ where: { workspaceId, leadId: lead.id, stepNumber: 2 } });
    if (sentEmails >= 2 && completedTask?.status === 'completed' && nextTask?.status === 'scheduled') {
      return { sentEmails, completedTask, nextTask };
    }
    return null;
  }, 'follow-up send and step 2 scheduling', 45, 1_000);

  const drafts = await prisma.emailDraft.findMany({
    where: { workspaceId, leadId: lead.id },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 }, sendQueue: true },
    orderBy: { createdAt: 'asc' },
  });
  const sentEmails = await prisma.sentEmail.findMany({ where: { workspaceId, leadId: lead.id }, orderBy: { sentAt: 'asc' } });
  const followUpTasks = await prisma.followUpTask.findMany({ where: { workspaceId, leadId: lead.id }, orderBy: { stepNumber: 'asc' } });

  assert(drafts.length >= 2, 'follow-up draft was not created');
  assert(drafts[1].versions[0]?.followupNumber === 1, 'follow-up draft was not tagged with follow-up step number');
  assert(sentEmails.length >= 2, 'follow-up email was not sent');
  assert(followUpTasks.some(task => task.stepNumber === 2 && task.status === 'scheduled'), 'next follow-up step was not scheduled');

  console.log(JSON.stringify({
    status: 'passed',
    workspaceId,
    draftCount: drafts.length,
    sentEmailCount: sentEmails.length,
    followUpStatuses: followUpTasks.map(task => ({ stepNumber: task.stepNumber, status: task.status })),
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
