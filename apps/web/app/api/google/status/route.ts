import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function GET(req: NextRequest) {
  try {
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const connection = await prisma.googleConnection.findFirst({
      where: { workspaceId },
      orderBy: { connectedAt: 'desc' },
      select: { gmailAddress: true, expiresAt: true, connectedAt: true }
    });

    if (!connection) {
      return NextResponse.json({ connected: false, email: null });
    }

    // Check if token is expired and has been more than 10 mins since expiry (refresh window)
    const expired = connection.expiresAt < new Date(Date.now() - 10 * 60 * 1000);

    return NextResponse.json({
      connected: true,
      email: connection.gmailAddress,
      expired,
      connectedAt: connection.connectedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: securityErrorStatus(error) }
    );
  }
}
