import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/auth/server';

const authPagePaths = new Set(['/login', '/register']);

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAuthApiRoute = pathname.startsWith('/api/auth');
  const isAuthPage = authPagePaths.has(pathname);

  if (isAuthApiRoute) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (isAuthPage) {
    if (session?.user.id) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
  }

  if (session?.user.id) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)'],
};
