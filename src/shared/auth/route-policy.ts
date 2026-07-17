const guestOnlyPagePaths = new Set(['/login', '/register']);
const publicPagePaths = new Set([
  ...guestOnlyPagePaths,
  '/check-email',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]);
const publicApiRoots = ['/api/auth', '/api/health'];

export function isPublicPagePath(pathname: string) {
  return publicPagePaths.has(pathname);
}

export function isGuestOnlyPagePath(pathname: string) {
  return guestOnlyPagePaths.has(pathname);
}

export function isPublicApiPath(pathname: string) {
  return publicApiRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export function getSafePostAuthPath(candidate: string | null | undefined) {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '/';
  }

  let url: URL;
  try {
    url = new URL(candidate, 'https://auth-route.local');
  } catch {
    return '/';
  }

  if (url.origin !== 'https://auth-route.local'
    || isPublicPagePath(url.pathname)
    || url.pathname === '/api'
    || url.pathname.startsWith('/api/')) {
    return '/';
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
