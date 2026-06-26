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
    const maybeName = 'name' in body ? normalizeText(body.name) : undefined;
    const maybeEmail = 'email' in body ? normalizeText(body.email) : undefined;
    const maybeJobTitle = 'jobTitle' in body ? normalizeText(body.jobTitle) : undefined;
    const maybeCompanyName = 'companyName' in body ? normalizeText(body.companyName) : undefined;
    const maybeHomeCountry = 'homeCountry' in body ? normalizeText(body.homeCountry) : undefined;

    if (maybeName !== undefined) data.name = maybeName;
    if (maybeEmail !== undefined) data.email = maybeEmail;
    if (maybeJobTitle !== undefined) data.jobTitle = maybeJobTitle;
    if (maybeCompanyName !== undefined) data.companyName = maybeCompanyName;
    if (maybeHomeCountry !== undefined) data.homeCountry = maybeHomeCountry;

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
