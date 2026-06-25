import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../packages/db/node_modules/@prisma/client');
const prisma = new PrismaClient();
const { encrypt, decrypt } = await import('../apps/web/server/security/encryption.ts');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function main() {
  const rawToken = 'raw-google-token-for-security-test';
  const encrypted = encrypt(rawToken);
  if (encrypted === rawToken || decrypt(encrypted) !== rawToken || encrypted.split(':').length !== 3) throw new Error('AES-256-GCM round trip failed');
  const workspaceId = `ws_security_${Date.now().toString(36)}`;
  await prisma.workspace.create({ data: { id: workspaceId, name: 'Security tests' } });
  const job = await prisma.job.create({ data: { workspaceId, name: 'Webhook test', status: 'running' } });
  const rawBody = JSON.stringify({ type: 'heartbeat', data: { job_id: job.id, message: 'security test' } });
  const send = (timestamp, signature) => fetch(`${base}/api/webhooks/worker`, { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json', ...(timestamp ? { 'x-webhook-timestamp': timestamp } : {}), ...(signature ? { 'x-webhook-signature': signature } : {}) }, body: rawBody });
  if ((await send()).status !== 401) throw new Error('Unsigned webhook accepted');
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 1000);
  const staleSignature = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET).update(`${staleTimestamp}.${rawBody}`).digest('hex');
  if ((await send(staleTimestamp, staleSignature)).status !== 401) throw new Error('Stale webhook accepted');
  const timestamp = String(Math.floor(Date.now() / 1000));
  if ((await send(timestamp, '00'.repeat(32))).status !== 401) throw new Error('Invalid webhook signature accepted');
  const signature = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  if ((await send(timestamp, signature)).status !== 200) throw new Error('Valid webhook rejected');
  console.log(JSON.stringify({ status: 'passed', encryption: 'aes-256-gcm', webhookHmac: true, replayProtection: true }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
