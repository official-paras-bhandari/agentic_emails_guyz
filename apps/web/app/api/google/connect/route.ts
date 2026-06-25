import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@packages/db';
import { GoogleOAuthService } from '@/server/services/GoogleOAuthService';
import { createSessionToken, requireWorkspace, securityErrorStatus } from '@/server/security/request';

export async function GET(req: NextRequest) {
  try {
    const workspaceId = requireWorkspace(req, req.nextUrl.searchParams.get('workspaceId'));
    const connection = await prisma.googleConnection.findFirst({ where: { workspaceId }, select: { gmailAddress: true, connectedAt: true, expiresAt: true } });
    if (req.nextUrl.searchParams.get('status') === '1') {
      return NextResponse.json({ 
        connected: Boolean(connection), 
        connection,
        hasCredentials: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
      });
    }
    const url = new GoogleOAuthService().getAuthUrl(createSessionToken(workspaceId, 10 * 60));
    return NextResponse.redirect(url);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: securityErrorStatus(error) }); }
}
