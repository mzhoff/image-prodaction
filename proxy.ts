import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestId } from '@/shared/api/request-id';
import {
  isGuestOnlyPagePath,
  isPublicApiPath,
  isPublicPagePath,
} from '@/shared/auth/route-policy';
import { getRequestSession } from '@/shared/auth/session';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  if (isPublicApiPath(pathname)) {
    return continueRequest(requestHeaders, requestId);
  }

  const session = await getRequestSession(request);
  const isPublicPage = isPublicPagePath(pathname);

  if (isPublicPage) {
    const response = session?.user.id && isGuestOnlyPagePath(pathname)
      ? NextResponse.redirect(new URL('/', request.url))
      : continueRequest(requestHeaders, requestId);
    response.headers.set('x-request-id', requestId);
    return response;
  }

  if (session?.user.id) return continueRequest(requestHeaders, requestId);

  if (pathname.startsWith('/api/')) {
    const response = NextResponse.json({
      error: { code: 'unauthorized', message: 'Authentication required.' },
    }, { status: 401 });
    response.headers.set('x-request-id', requestId);
    return response;
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(loginUrl);
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)'],
};

function continueRequest(requestHeaders: Headers, requestId: string) {
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
}
