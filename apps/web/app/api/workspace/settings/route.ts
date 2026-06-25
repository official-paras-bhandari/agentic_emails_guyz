import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function GET(req: NextRequest) {
  try {
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    let settings = await prisma.workspaceSetting.findUnique({ where: { workspaceId } });
    if (!settings) {
      settings = await prisma.workspaceSetting.create({
        data: { workspaceId, dailySendLimit: 100, delaySeconds: 30 }
      });
    }
    return NextResponse.json(settings);
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

    const data: { dailySendLimit?: number; delaySeconds?: number; sheetExportId?: string | null } = {};
    if (typeof body.dailySendLimit === 'number') data.dailySendLimit = body.dailySendLimit;
    if (typeof body.delaySeconds === 'number') data.delaySeconds = body.delaySeconds;
    if (body.sheetExportId !== undefined) {
      data.sheetExportId = body.sheetExportId ? String(body.sheetExportId).trim() : null;
    }

    const settings = await prisma.workspaceSetting.upsert({
      where: { workspaceId },
      update: data,
      create: {
        workspaceId,
        dailySendLimit: data.dailySendLimit ?? 100,
        delaySeconds: data.delaySeconds ?? 30,
        sheetExportId: data.sheetExportId ?? null
      }
    });

    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
