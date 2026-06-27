import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { controlPrisma, getTenantPrismaForTenant } from '@packages/db';
import { createSessionToken } from '@/server/security/request';

/**
 * POST /api/auth/invite/accept
 * Accepts an invitation, sets the password, creates the user, and signs a session.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }

    // Find the invitation
    const invite = await controlPrisma.invitation.findUnique({
      where: { token },
    });

    if (!invite) {
      return NextResponse.json({ error: 'Invalid invitation token' }, { status: 400 });
    }

    if (invite.accepted) {
      return NextResponse.json({ error: 'Invitation has already been accepted' }, { status: 400 });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 });
    }

    // Verify workspace exists in Control DB
    const workspace = await controlPrisma.workspace.findUnique({
      where: { id: invite.workspaceId },
    });
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace no longer exists' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const email = invite.email;

    // Check if the user already exists in Control DB
    let user = await controlPrisma.user.findUnique({
      where: { username: email },
    });

    if (user) {
      // Activate existing user and update password
      user = await controlPrisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          isActive: true,
          onboardingCompleted: false, // Reset onboarding completion for the new workspace context
        },
      });
    } else {
      // Create fresh user in Control DB
      user = await controlPrisma.user.create({
        data: {
          username: email,
          email,
          passwordHash,
          isActive: true,
          role: invite.role,
          onboardingCompleted: false,
        },
      });
    }

    // Assign to Tenant in Control DB
    await controlPrisma.tenantMember.upsert({
      where: {
        tenantId_userId: {
          tenantId: invite.tenantId,
          userId: user.id,
        },
      },
      update: { role: invite.role },
      create: {
        tenantId: invite.tenantId,
        userId: user.id,
        role: invite.role,
      },
    });

    // Assign to Workspace in Control DB
    await controlPrisma.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: invite.workspaceId,
        },
      },
      update: { role: invite.role === 'ADMIN' ? 'OWNER' : 'MEMBER' },
      create: {
        userId: user.id,
        workspaceId: invite.workspaceId,
        role: invite.role === 'ADMIN' ? 'OWNER' : 'MEMBER',
      },
    });

    // Verify Workspace exists in the Tenant's business database
    const tenantPrisma = await getTenantPrismaForTenant(invite.tenantId);
    await tenantPrisma.workspace.upsert({
      where: { id: invite.workspaceId },
      update: {},
      create: {
        id: invite.workspaceId,
        name: workspace.name,
      },
    });

    // Mark invitation as accepted
    await controlPrisma.invitation.update({
      where: { id: invite.id },
      data: { accepted: true },
    });

    // Set cookie and log user in
    const response = NextResponse.json({
      ok: true,
      workspaceId: invite.workspaceId,
      tenantId: invite.tenantId,
      userId: user.id,
      onboardingCompleted: false,
    });

    response.cookies.set(
      'agentic_session',
      createSessionToken(invite.tenantId, invite.workspaceId, 12 * 60 * 60, {
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
  } catch (error: any) {
    console.error('Accept invite failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
