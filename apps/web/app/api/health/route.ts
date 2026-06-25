import { NextResponse } from 'next/server';
import { prisma } from '@packages/db';

export async function GET() {
  const checks: Record<string, string> = {};
  try { await prisma.$queryRaw`SELECT 1`; checks.database = 'ok'; } catch { checks.database = 'error'; }
  try { const response = await fetch(`${process.env.WORKER_URL || 'http://127.0.0.1:8000'}/`, { signal: AbortSignal.timeout(2000) }); checks.worker = response.ok ? 'ok' : 'error'; } catch { checks.worker = 'error'; }
  const healthy = Object.values(checks).every(value => value === 'ok');
  return NextResponse.json({ status: healthy ? 'ok' : 'degraded', checks }, { status: healthy ? 200 : 503 });
}
