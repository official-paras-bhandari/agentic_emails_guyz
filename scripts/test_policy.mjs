import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../packages/db/node_modules/@prisma/client');
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const headers = { 'content-type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY };
const assert = (value, message) => { if (!value) throw new Error(message); };
async function post(path, workspaceId, body = {}) {
  const response = await fetch(base + path, { method: 'POST', headers, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ ...body, workspaceId }) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const suffix = Date.now().toString(36);
  const workspaceId = `ws_policy_${suffix}`;
  await prisma.workspace.create({ data: { id: workspaceId, name: 'Policy tests' } });
  await prisma.workspaceSetting.create({ data: { workspaceId, dailySendLimit: 50, delaySeconds: 0 } });
  const campaign1 = await prisma.campaign.create({ data: { workspaceId, name: 'Campaign 1', status: 'active' } });
  const campaign2 = await prisma.campaign.create({ data: { workspaceId, name: 'Campaign 2', status: 'active' } });
  const createLead = number => prisma.lead.create({ data: { workspaceId, email: `policy${suffix}-${number}@example${number}.com`, website: `https://example${number}.com`, normalizedDomain: `example${number}.com` } });
  const policy = (action, leadId, campaignId, lead) => post('/api/contact-policy', workspaceId, { action, leadId, campaignId, lead });

  const lead1 = await createLead(1);
  await prisma.campaignLead.create({ data: { campaignId: campaign1.id, leadId: lead1.id, status: 'active' } });
  assert((await policy('add_to_campaign', lead1.id, campaign1.id)).reason === 'already_in_campaign', 'same campaign collision failed');
  assert((await policy('add_to_campaign', lead1.id, campaign2.id)).reason === 'active_campaign_collision', 'cross-campaign collision failed');
  const lead7 = await createLead(7);
  assert((await policy('add_to_campaign', lead7.id, campaign1.id)).reason === 'campaign_active', 'active campaign should reject new leads');
  const draft1 = await prisma.emailDraft.create({ data: { workspaceId, leadId: lead1.id, campaignId: campaign1.id, subject: 'Test', body: 'Test', status: 'drafted' } });
  assert((await policy('draft', lead1.id, campaign1.id)).reason === 'draft_already_exists', 'draft collision failed');
  await prisma.sendQueue.create({ data: { workspaceId, draftId: draft1.id, status: 'pending' } });
  assert((await policy('queue', lead1.id, campaign1.id)).reason === 'send_already_queued', 'queue collision failed');

  const lead2 = await createLead(2);
  const draft2 = await prisma.emailDraft.create({ data: { workspaceId, leadId: lead2.id, campaignId: campaign1.id, subject: 'Test', body: 'Test', status: 'sent' } });
  await prisma.sentEmail.create({ data: { workspaceId, leadId: lead2.id, draftId: draft2.id, sentAt: new Date() } });
  assert((await policy('send', lead2.id, campaign1.id)).reason === 'already_sent_recently', 'recent send collision failed');

  const lead3 = await createLead(3);
  const task = await prisma.followUpTask.create({ data: { workspaceId, leadId: lead3.id, campaignId: campaign1.id, stepNumber: 1, status: 'scheduled', scheduledFor: new Date() } });
  assert((await policy('followup', lead3.id, campaign1.id)).reason === 'followup_already_scheduled', 'follow-up collision failed');
  await post('/api/replies', workspaceId, { leadId: lead3.id, content: 'Please send more information' });
  assert((await prisma.followUpTask.findUnique({ where: { id: task.id } })).status === 'cancelled', 'reply did not cancel follow-up');

  const lead4 = await createLead(4);
  assert((await post('/api/replies', workspaceId, { leadId: lead4.id, content: 'No thanks, I am not interested' })).classification === 'not_interested', 'not-interested classification failed');
  assert((await policy('reengage', lead4.id)).reason === 'negative_reply_cooldown', '90-day cooldown failed');

  const lead5 = await createLead(5);
  assert((await post('/api/replies', workspaceId, { leadId: lead5.id, content: 'Stop emailing me and remove me' })).classification === 'unsubscribe', 'unsubscribe classification failed');
  assert((await policy('discover', null, null, { email: lead5.email })).reason === 'email_suppressed', 'unsubscribe did not suppress discovery');
  await prisma.lead.update({ where: { id: lead5.id }, data: { status: 'new' } });
  assert((await policy('send', lead5.id)).reason === 'email_suppressed', 'manual reset bypassed suppression');

  const lead6 = await createLead(6);
  const draft6 = await prisma.emailDraft.create({ data: { workspaceId, leadId: lead6.id, campaignId: campaign1.id, subject: 'Test', body: 'Test', status: 'sent' } });
  await prisma.sentEmail.create({ data: { workspaceId, leadId: lead6.id, draftId: draft6.id, sentAt: new Date() } });
  for (let stepNumber = 1; stepNumber <= 4; stepNumber++) await prisma.followUpTask.create({ data: { workspaceId, leadId: lead6.id, campaignId: campaign1.id, stepNumber, status: 'completed', scheduledFor: new Date() } });
  assert((await policy('reengage', lead6.id)).reason === 'completed_campaign_cooldown', '60-day cooldown failed');

  await post('/api/suppression-list', workspaceId, { domain: 'https://www.example.com/contact', reason: 'Domain test' });
  for (const website of ['https://www.example.com', 'http://example.com/contact', 'EXAMPLE.com']) assert((await policy('discover', null, null, { website })).reason === 'domain_suppressed', `domain normalization failed: ${website}`);
  console.log(JSON.stringify({ status: 'passed', workspaceId, cases: 12 }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
