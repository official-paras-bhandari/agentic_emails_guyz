import { NextResponse } from 'next/server';
import { controlPrisma, getTenantPrismaForTenant } from '@packages/db';

export async function GET() {
  const checks: Record<string, string> = {};

  // 1. Check Control Database
  try {
    await controlPrisma.$queryRaw`SELECT 1`;
    checks.controlDatabase = 'ok';
  } catch (err: any) {
    checks.controlDatabase = `error: ${err.message || err}`;
  }

  // 2. Check Tenant Databases
  try {
    const activeTenants = await controlPrisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      take: 1
    });
    if (activeTenants.length > 0) {
      const tenantPrisma = await getTenantPrismaForTenant(activeTenants[0].id);
      await tenantPrisma.$queryRaw`SELECT 1`;
      checks.tenantDatabase = 'ok';
    } else {
      checks.tenantDatabase = 'no_active_tenants';
    }
  } catch (err: any) {
    checks.tenantDatabase = `error: ${err.message || err}`;
  }

  // 3. Check Python Worker + Redis (via readiness endpoint)
  try {
    const workerUrl = process.env.WORKER_URL || 'http://127.0.0.1:8000';
    const response = await fetch(`${workerUrl}/health/ready`, { signal: AbortSignal.timeout(2000) });
    checks.worker = response.ok ? 'ok' : `error: status ${response.status}`;
  } catch (err: any) {
    checks.worker = `error: ${err.message || err}`;
  }

  const healthy = Object.values(checks).every(value => value === 'ok' || value === 'no_active_tenants');

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 }
  );
}
