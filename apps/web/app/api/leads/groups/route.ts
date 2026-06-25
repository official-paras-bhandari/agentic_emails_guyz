import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function GET(req: NextRequest) {
  try {
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const groups = await prisma.leadGroup.findMany({
      where: { workspaceId },
      include: {
        _count: {
          select: { leads: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(groups);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const workspaceId = requireWorkspace(req, body.workspaceId);
    
    if (!body.name) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    const group = await prisma.leadGroup.create({
      data: {
        workspaceId,
        name: body.name.trim(),
        description: body.description?.trim(),
      },
    });
    
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
