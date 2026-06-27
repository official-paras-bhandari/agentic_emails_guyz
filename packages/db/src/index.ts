import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

// Re-export the Prisma client class so typing works across the monorepo
export { PrismaClient } from '@prisma/client';

const controlUrl = process.env.CONTROL_DATABASE_URL || process.env.DATABASE_URL;
export const controlPrisma = new PrismaClient({
  datasources: {
    db: {
      url: controlUrl,
    },
  },
  log: process.env.DB_LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
});

// Cache for tenant Prisma clients keyed by database URL
const tenantPrismaCache = new Map<string, PrismaClient>();

export function getTenantPrismaByUrl(url: string): PrismaClient {
  let client = tenantPrismaCache.get(url);
  if (!client) {
    client = new PrismaClient({
      datasources: {
        db: {
          url,
        },
      },
      log: process.env.DB_LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
    });
    tenantPrismaCache.set(url, client);
  }
  return client;
}

const tenantUrlCache = new Map<string, string>();

export async function getTenantPrismaForTenant(tenantId: string): Promise<PrismaClient> {
  let url = tenantUrlCache.get(tenantId);
  if (!url) {
    const tenant = await controlPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { databaseUrl: true },
    });
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }
    url = tenant.databaseUrl;
    tenantUrlCache.set(tenantId, url);
  }
  return getTenantPrismaByUrl(url);
}

export async function disconnectAllTenants() {
  for (const client of tenantPrismaCache.values()) {
    await client.$disconnect();
  }
  tenantPrismaCache.clear();
  tenantUrlCache.clear();
}

// Storage for active tenant client
export const tenantPrismaStorage = new AsyncLocalStorage<PrismaClient>();

// Dynamic proxy representing the legacy global prisma client
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop, receiver) {
    const activeClient = tenantPrismaStorage.getStore();
    // Fall back to controlPrisma when not in a tenant context
    const client = activeClient || controlPrisma;
    return Reflect.get(client, prop, receiver);
  },
});
