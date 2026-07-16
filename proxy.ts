import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/shared/auth/server';

const publicPagePaths = new Set(['/login', '/register']);
const publicApiPrefixes = ['/api/auth', '/api/health'];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (publicApiPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const session = await (await getAuth()).api.getSession({ headers: request.headers });
  const isPublicPage = publicPagePaths.has(pathname);

  if (isPublicPage) {
    return session?.user.id
      ? NextResponse.redirect(new URL('/', request.url))
      : NextResponse.next();
  }

  if (session?.user.id) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({
      error: { code: 'unauthorized', message: 'Authentication required.' },
    }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)'],
};
