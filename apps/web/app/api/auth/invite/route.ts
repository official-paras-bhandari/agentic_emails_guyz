import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { controlPrisma } from '@packages/db';
import { readSignedWorkspaceToken } from '@/server/security/request';

/**
 * POST /api/auth/invite
 * Allows an admin user to invite another user.
 */
export async function POST(req: NextRequest) {
  try {
    const session = readSignedWorkspaceToken(req.cookies.get('agentic_session')?.value);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if the current user is an admin or owner in the tenant
    const member = await controlPrisma.tenantMember.findFirst({
      where: {
        tenantId: session.tenantId,
        userId: session.userId,
      },
    });

    if (!member || member.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const { email, role, workspaceId } = await req.json();
    if (!email || !workspaceId) {
      return NextResponse.json({ error: 'Email and workspaceId are required' }, { status: 400 });
    }

    // Verify workspace belongs to the same tenant
    const workspace = await controlPrisma.workspace.findFirst({
      where: {
        id: workspaceId,
        tenantId: session.tenantId,
      },
    });
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found in this tenant' }, { status: 400 });
    }

    // Generate secure invite token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiry

    const invite = await controlPrisma.invitation.create({
      data: {
        email: email.trim().toLowerCase(),
        role: role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
        tenantId: session.tenantId,
        workspaceId,
        token,
        expiresAt,
      },
    });

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        email: invite.email,
        token: invite.token,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('Invite generation failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
