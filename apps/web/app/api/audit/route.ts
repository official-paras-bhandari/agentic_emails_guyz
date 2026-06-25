import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = requireWorkspace(req, searchParams.get('workspaceId'));
    const entityType = searchParams.get('entityType') || undefined;

    const logs = await prisma.auditLog.findMany({
      where: { 
        workspaceId,
        entityType: entityType || undefined
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: securityErrorStatus(error) });
  }
}
