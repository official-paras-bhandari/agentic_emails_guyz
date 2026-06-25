import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { createSessionToken } from '@/server/security/request';

function equal(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const normalizedUsername = String(username || '').trim();
  const normalizedPassword = String(password || '');

  const user = normalizedUsername
    ? await prisma.user.findFirst({
        where: { username: normalizedUsername },
        include: {
          workspaces: {
            include: { workspace: true },
          },
        },
      })
    : null;

  if (user?.isActive) {
    const passwordMatches = await bcrypt.compare(normalizedPassword, user.passwordHash);
    const membership = user.workspaces[0];

    if (!membership) {
      return NextResponse.json({ error: 'No workspace is assigned to this user' }, { status: 403 });
    }

    if (passwordMatches) {
      const response = NextResponse.json({ ok: true, workspaceId: membership.workspaceId, userId: user.id });
      response.cookies.set(
        'agentic_session',
        createSessionToken(membership.workspaceId, 12 * 60 * 60, {
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

  const expectedUser = process.env.INTERNAL_USERNAME;
  const expectedPassword = process.env.INTERNAL_PASSWORD;
  const workspaceId = process.env.INTERNAL_WORKSPACE_ID;
  if (!expectedUser || !expectedPassword || !workspaceId) {
    return NextResponse.json({ error: 'Internal authentication is not configured' }, { status: 503 });
  }
  if (!equal(normalizedUsername, expectedUser) || !equal(normalizedPassword, expectedPassword)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true, workspaceId });
  response.cookies.set('agentic_session', createSessionToken(workspaceId), {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 60 * 60,
  });
  return response;
}
