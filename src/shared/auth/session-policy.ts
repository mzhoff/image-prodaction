import type { BetterAuthOptions } from 'better-auth';

export const AUTH_COOKIE_PREFIX = 'image-production';
export const AUTH_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const AUTH_SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

// Cookies are shared across ports on a host. Never use Better Auth's default
// prefix here: a Content Hub login/logout would overwrite our session cookie.
export const authSessionPolicy = {
  advanced: { cookiePrefix: AUTH_COOKIE_PREFIX },
  session: {
    expiresIn: AUTH_SESSION_TTL_SECONDS,
    updateAge: AUTH_SESSION_UPDATE_AGE_SECONDS,
    // Keep the database authoritative, including immediate session revocation.
    cookieCache: { enabled: false },
  },
} satisfies Pick<BetterAuthOptions, 'advanced' | 'session'>;
