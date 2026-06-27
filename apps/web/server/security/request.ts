import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { controlPrisma, getTenantPrismaForTenant, tenantPrismaStorage } from '@packages/db';

export type SessionPayload = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  username?: string;
  exp: number;
};

function authSecret() {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('INTERNAL_AUTH_SECRET must be at least 32 characters in production');
  }
  return secret || 'development-only-agentic-auth-secret';
}

export function createSessionToken(
  tenantId: string,
  workspaceId: string,
  ttlSeconds = 12 * 60 * 60,
  user?: { userId?: string; username?: string }
) {
  const encoded = Buffer.from(
    JSON.stringify({
      tenantId,
      workspaceId,
      userId: user?.userId,
      username: user?.username,
      exp: Date.now() + ttlSeconds * 1000,
    })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', authSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function readSignedWorkspaceToken(token?: string): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', authSecret()).update(encoded).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload;
    return payload.exp > Date.now() && payload.workspaceId && payload.tenantId ? payload : null;
  } catch {
    return null;
  }
}

export async function getTenantPrismaAndWorkspace(
  req: NextRequest,
  requestedWorkspaceId?: string | null
) {
  const configuredWorkspace = process.env.INTERNAL_WORKSPACE_ID;
  const apiKey = req.headers.get('x-internal-api-key');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const validApiKey = process.env.INTERNAL_API_KEY && (apiKey === process.env.INTERNAL_API_KEY || bearer === process.env.INTERNAL_API_KEY);
  const session = readSignedWorkspaceToken(req.cookies.get('agentic_session')?.value);

  if (!validApiKey && !session) {
    throw new Error('UNAUTHORIZED');
  }

  let workspaceId: string;
  let tenantId: string;

  if (session) {
    workspaceId = session.workspaceId;
    tenantId = session.tenantId;

    // Check if onboarding is completed, unless we are on the onboarding API endpoint
    const pathname = req.nextUrl.pathname;
    if (!pathname.startsWith('/api/user/onboarding') && !pathname.startsWith('/api/auth/logout')) {
      const user = await controlPrisma.user.findUnique({
        where: { id: session.userId },
        select: { onboardingCompleted: true },
      });
      if (user && !user.onboardingCompleted) {
        throw new Error('ONBOARDING_REQUIRED');
      }
    }
  } else {
    // API key auth (internal worker calls)
    const wsId = requestedWorkspaceId || configuredWorkspace;
    if (!wsId) throw new Error('WORKSPACE_REQUIRED');
    
    // Resolve tenantId from the Control DB
    const ws = await controlPrisma.workspace.findUnique({
      where: { id: wsId },
      select: { tenantId: true },
    });
    if (!ws || !ws.tenantId) {
      throw new Error('WORKSPACE_REQUIRED');
    }
    workspaceId = wsId;
    tenantId = ws.tenantId;
  }

  if (requestedWorkspaceId && workspaceId !== requestedWorkspaceId) {
    throw new Error('FORBIDDEN');
  }

  const tenantPrisma = await getTenantPrismaForTenant(tenantId);
  return { prisma: tenantPrisma, workspaceId, tenantId, userId: session?.userId };
}

/**
 * Runs a NextJS request handler scoped to the correct tenant Prisma instance.
 */
export async function withTenantContext<T>(
  req: NextRequest,
  requestedWorkspaceId: string | null,
  fn: (ctx: { prisma: any; workspaceId: string; tenantId: string; userId?: string }) => Promise<T>
): Promise<T> {
  const ctx = await getTenantPrismaAndWorkspace(req, requestedWorkspaceId);
  return tenantPrismaStorage.run(ctx.prisma, () => fn(ctx));
}

export function requireWorkspace(req: NextRequest, requestedWorkspaceId?: string | null) {
  const configuredWorkspace = process.env.INTERNAL_WORKSPACE_ID;
  const apiKey = req.headers.get('x-internal-api-key');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const validApiKey = process.env.INTERNAL_API_KEY && (apiKey === process.env.INTERNAL_API_KEY || bearer === process.env.INTERNAL_API_KEY);
  const session = readSignedWorkspaceToken(req.cookies.get('agentic_session')?.value);

  if (!validApiKey && !session) {
    throw new Error('UNAUTHORIZED');
  }

  const workspaceId =
    session?.workspaceId ||
    (validApiKey ? requestedWorkspaceId || configuredWorkspace : null);
  if (!workspaceId) throw new Error('WORKSPACE_REQUIRED');
  if (requestedWorkspaceId && workspaceId !== requestedWorkspaceId) throw new Error('FORBIDDEN');
  return workspaceId;
}

export function readSession(req: NextRequest) {
  return readSignedWorkspaceToken(req.cookies.get('agentic_session')?.value);
}

export function readSessionUserId(req: NextRequest) {
  return readSession(req)?.userId || null;
}

export function securityErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'UNAUTHORIZED') return 401;
  if (message === 'ONBOARDING_REQUIRED') return 403;
  if (message === 'FORBIDDEN') return 403;
  if (message === 'WORKSPACE_REQUIRED') return 400;
  return 500;
}

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function normalizeDomain(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return null;
  }
}

export function normalizePhone(value?: string | null) {
  if (!value) return null;
  const prefix = value.trim().startsWith('+') ? '+' : '';
  const digits = value.replace(/\D/g, '');
  return digits ? `${prefix}${digits}` : null;
}
