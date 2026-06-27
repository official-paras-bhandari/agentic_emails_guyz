import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { controlPrisma, getTenantPrismaByUrl } from '@packages/db';
import { createSessionToken } from '@/server/security/request';
import { tenantDbService } from '@/server/services/TenantDBService';

function equal(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function ensureInternalWorkspace(
  username: string,
  password: string,
  workspaceId: string,
  tenantId: string
) {
  const tenantName = 'Default Tenant';
  const workspaceName = 'Default Workspace';
  const passwordHash = await bcrypt.hash(password, 10);

  let tenant = await controlPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, databaseUrl: true },
  });

  if (!tenant) {
    const databaseUrl = await tenantDbService.provisionDatabase(tenantId);
    tenant = await controlPrisma.tenant.create({
      data: {
        id: tenantId,
        name: tenantName,
        databaseUrl,
        status: 'ACTIVE',
      },
      select: { id: true, databaseUrl: true },
    });
  }

  const tenantPrisma = getTenantPrismaByUrl(tenant.databaseUrl);
  await tenantPrisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: {
      id: workspaceId,
      name: workspaceName,
    },
  });
  await tenantPrisma.workspaceSetting.upsert({
    where: { workspaceId },
    update: {},
    create: {
      workspaceId,
      dailySendLimit: 50,
      delaySeconds: 30,
    },
  });

  const workspace = await controlPrisma.workspace.upsert({
    where: { id: workspaceId },
    update: { tenantId: tenant.id, name: workspaceName },
    create: {
      id: workspaceId,
      name: workspaceName,
      tenantId: tenant.id,
    },
    select: { id: true },
  });

  const user = await controlPrisma.user.upsert({
    where: { username },
    update: {
      email: `${username}@example.com`,
      passwordHash,
      isActive: true,
      role: 'ADMIN',
      onboardingCompleted: true,
      name: 'System Admin',
      jobTitle: 'Administrator',
      companyName: 'Internal Corp',
      homeCountry: 'Australia',
    },
    create: {
      username,
      email: `${username}@example.com`,
      passwordHash,
      isActive: true,
      role: 'ADMIN',
      onboardingCompleted: true,
      name: 'System Admin',
      jobTitle: 'Administrator',
      companyName: 'Internal Corp',
      homeCountry: 'Australia',
    },
    select: { id: true, username: true },
  });

  await controlPrisma.tenantMember.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: user.id,
      },
    },
    update: { role: 'ADMIN' },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: 'ADMIN',
    },
  });

  await controlPrisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    },
    update: { role: 'OWNER' },
    create: {
      userId: user.id,
      workspaceId: workspace.id,
      role: 'OWNER',
    },
  });

  return { tenantId: tenant.id, workspaceId: workspace.id, userId: user.id, username: user.username, databaseUrl: tenant.databaseUrl };
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const normalizedUsername = String(username || '').trim();
  const normalizedPassword = String(password || '');

  // 1. Authenticate against Control DB
  const user = normalizedUsername
    ? await controlPrisma.user.findFirst({
        where: { username: normalizedUsername },
        include: {
          tenantMemberships: true,
          workspaces: true,
        },
      })
    : null;

  if (user?.isActive) {
    const passwordMatches = await bcrypt.compare(normalizedPassword, user.passwordHash);
    const membership = user.workspaces[0];
    const tenantMembership = user.tenantMemberships[0];

    if (!membership || !tenantMembership) {
      return NextResponse.json({ error: 'No workspace or tenant is assigned to this user' }, { status: 403 });
    }

    if (passwordMatches) {
      const response = NextResponse.json({
        ok: true,
        workspaceId: membership.workspaceId,
        tenantId: tenantMembership.tenantId,
        userId: user.id,
        onboardingCompleted: user.onboardingCompleted
      });
      
      response.cookies.set(
        'agentic_session',
        createSessionToken(tenantMembership.tenantId, membership.workspaceId, 12 * 60 * 60, {
          userId: user.id,
          username: user.username,
        }),
        {
          httpOnly: true,
          sameSite: 'strict',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 12 * 60 * 60,
        }
      );
      return response;
    }
  }

  // 2. Optional Environment Fallback Login (Disabled in Prod by default)
  const expectedUser = process.env.INTERNAL_USERNAME;
  const expectedPassword = process.env.INTERNAL_PASSWORD;
  const workspaceId = process.env.INTERNAL_WORKSPACE_ID;
  const allowInternalLogin =
    process.env.ALLOW_INTERNAL_LOGIN === 'true' ||
    (process.env.NODE_ENV !== 'production' && !!expectedUser && !!expectedPassword && !!workspaceId);

  if (allowInternalLogin && expectedUser && expectedPassword && workspaceId) {
    if (equal(normalizedUsername, expectedUser) && equal(normalizedPassword, expectedPassword)) {
      const internal = await ensureInternalWorkspace(
        expectedUser,
        expectedPassword,
        workspaceId,
        'tenant_internal'
      );

      const response = NextResponse.json({
        ok: true,
        workspaceId: internal.workspaceId,
        tenantId: internal.tenantId,
        userId: internal.userId,
        onboardingCompleted: true,
      });
      response.cookies.set(
        'agentic_session',
        createSessionToken(internal.tenantId, internal.workspaceId, 12 * 60 * 60, {
          userId: internal.userId,
          username: internal.username,
        }),
        {
          httpOnly: true,
          sameSite: 'strict',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 12 * 60 * 60,
        }
      );
      return response;
    }
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
