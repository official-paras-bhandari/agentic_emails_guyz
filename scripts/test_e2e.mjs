import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../packages/db/node_modules/@prisma/client');
const prisma = new PrismaClient();
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const apiKey = process.env.INTERNAL_API_KEY;
const headers = { 'content-type': 'application/json', 'x-internal-api-key': apiKey };

function assert(value, message) { if (!value) throw new Error(message); }
async function request(path, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(10_000), headers: { ...headers, ...(options.headers || {}) } });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
      return data;
    } catch (err) {
      lastError = err;
      const isTransient = err.message?.includes('fetch failed') || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNRESET';
      if (isTransient && attempt < 2) {
        console.warn(`[WARN] Transient error on ${path} (${err.message || err.code}), retrying in ${500 * (attempt + 1)}ms...`);
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
async function post(path, workspaceId, body = {}) { return request(path, { method: 'POST', body: JSON.stringify({ ...body, workspaceId }) }); }
async function runJob(workspaceId, prompt) {
  const session = await post('/api/chat/sessions', workspaceId);
  const command = await post('/api/chat/command', workspaceId, { sessionId: session.id, prompt });
  const jobId = command.jobId;
  for (let attempt = 0; attempt < 240; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = await request(`/api/jobs/${jobId}?workspaceId=${workspaceId}`);
    if (['completed', 'failed', 'cancelled'].includes(result.job.status)) return { command, result };
  }
  throw new Error(`Job ${jobId} timed out`);
}

async function main() {
  assert(apiKey, 'INTERNAL_API_KEY is required');
  const health = await request('/api/health');
  assert(health.status === 'ok', 'System health check failed');
  const suffix = Date.now().toString(36);
  const workspaceId = `ws_e2e_${suffix}`;
  await prisma.workspace.create({ data: { id: workspaceId, name: 'Automated E2E' } });
  await prisma.workspaceSetting.create({ data: { workspaceId, dailySendLimit: 20, delaySeconds: 0 } });

  const domainCases = [
    ['Find 10 salons in Sydney', true], ['Draft emails for these leads', true], ['Check replies from yesterday', true],
    ['Write me a recipe', false], ['Build me a game', false], ['What is the capital of France?', false],
    ['Write me a recipe for salon marketing', false],
  ];
  const session = await post('/api/chat/sessions', workspaceId);
  for (const [prompt, allowed] of domainCases) {
    const response = await post('/api/chat/command', workspaceId, { sessionId: session.id, prompt, skipExecution: true });
    assert((response.allowed !== false) === allowed, `Domain guard mismatch: ${prompt}`);
  }
  
  // Clear any mock leads created by the domain cases execution before starting the main scraper test
  await prisma.lead.deleteMany({ where: { workspaceId } });

  const first = await runJob(workspaceId, 'Find 5 salons in Sydney');
  assert(first.command.plan.quantity === 5, 'Requested quantity was not preserved');
  assert(first.result.job.status === 'completed', 'Core job did not complete');
  assert(first.result.stats.saved >= 1, 'Core job saved no leads');
  const leadCount = await prisma.lead.count({ where: { workspaceId } });
  const duplicate = await runJob(workspaceId, 'Find 5 salons in Sydney');
  assert(duplicate.result.stats.duplicatesSkipped >= 1, 'Duplicate rerun did not emit duplicate skips');
  assert(await prisma.lead.count({ where: { workspaceId } }) === leadCount + duplicate.result.stats.saved, 'Duplicate rerun lead count mismatch');

  const allLeads = await prisma.lead.findMany({ where: { workspaceId } });
  for (const l of allLeads) {
    if (l.normalizedDomain) await post('/api/suppression-list', workspaceId, { domain: l.normalizedDomain, reason: 'E2E suppression' });
  }
  const suppressed = await runJob(workspaceId, 'Find 5 salons in Sydney');
  assert(suppressed.result.logs.some(log => log.message.includes('blocked by policy')), 'Suppressed discovery was not blocked');

  const draftWorkspace = `${workspaceId}_draft`;
  await prisma.workspace.create({ data: { id: draftWorkspace, name: 'Automated Draft E2E' } });
  await prisma.workspaceSetting.create({ data: { workspaceId: draftWorkspace, dailySendLimit: 20, delaySeconds: 0 } });
  const drafted = await runJob(draftWorkspace, 'Find 5 salons in Sydney and draft emails');
  assert(drafted.result.job.status === 'completed', 'Draft job failed');
  const drafts = await prisma.emailDraft.findMany({ where: { workspaceId: draftWorkspace }, include: { versions: true } });
  assert(drafts.length >= 1, 'No drafts were generated');
  assert(drafts.every(draft => draft.versions.length === 1), 'Draft v1 was not created');
  assert(drafts.every(draft => draft.body.toLowerCase().includes('unsubscribe')), 'Draft unsubscribe footer missing');

  console.log(JSON.stringify({ status: 'passed', workspaceId, coreLeads: leadCount, duplicateSkipped: duplicate.result.stats.duplicatesSkipped, drafts: drafts.length }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
