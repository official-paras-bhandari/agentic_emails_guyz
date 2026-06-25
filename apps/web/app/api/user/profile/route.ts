import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { readSessionUserId, requireWorkspace, securityErrorStatus } from '@/server/security/request';

function normalizeText(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export async function GET(req: NextRequest) {
  try {
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const userId = readSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        workspaces: { some: { workspaceId } },
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        jobTitle: true,
        companyName: true,
        homeCountry: true,
      },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = requireWorkspace(req, body.workspaceId);
    const userId = readSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        workspaces: { some: { workspaceId } },
      },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const data: Record<string, string | null> = {};
    if ('name' in body) data.name = normalizeText(body.name);
    if ('email' in body) data.email = normalizeText(body.email);
    if ('jobTitle' in body) data.jobTitle = normalizeText(body.jobTitle);
    if ('companyName' in body) data.companyName = normalizeText(body.companyName);
    if ('homeCountry' in body) data.homeCountry = normalizeText(body.homeCountry);

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        jobTitle: true,
        companyName: true,
        homeCountry: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
