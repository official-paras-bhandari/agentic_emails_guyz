import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === '/login' || path.startsWith('/api/auth/') || path === '/api/health' || path.startsWith('/api/webhooks/')) return NextResponse.next();
  if (req.headers.get('x-internal-api-key') || req.headers.get('authorization')) return NextResponse.next();
  if (!req.cookies.has('agentic_session')) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
