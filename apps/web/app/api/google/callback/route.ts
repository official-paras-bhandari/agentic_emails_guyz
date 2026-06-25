import { NextRequest, NextResponse } from 'next/server';
import { GoogleOAuthService } from '@/server/services/GoogleOAuthService';
import { readSignedWorkspaceToken } from '@/server/security/request';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = readSignedWorkspaceToken(req.nextUrl.searchParams.get('state') || undefined);
  if (!code || !state) return NextResponse.json({ error: 'Invalid OAuth callback' }, { status: 400 });
  try {
    await new GoogleOAuthService().handleCallback(code, state.workspaceId);
    return NextResponse.redirect(new URL('/settings/google?connected=1', req.url));
  } catch (error) {
    return NextResponse.redirect(new URL(`/settings/google?error=${encodeURIComponent(error instanceof Error ? error.message : 'OAuth failed')}`, req.url));
  }
}
