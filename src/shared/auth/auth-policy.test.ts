import assert from 'node:assert/strict';
import test from 'node:test';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import {
  readAuthAccessPolicyConfig,
  readAuthServerConfig,
} from './config';
import { formatAuthError } from './error-message';
import {
  enforceAuthAccessPolicy,
  handleAuthRequestSafely,
} from './handler';
import {
  getSafePostAuthPath,
  isGuestOnlyPagePath,
  isPublicApiPath,
  isPublicPagePath,
} from './route-policy';
import { CURRENT_TERMS_VERSION } from './terms-contract';
import { createTermsAcceptanceAdditionalFields } from './terms-policy';
import { attemptPersonalWorkspaceBootstrap } from './workspace-bootstrap';

test('auth configuration accepts only explicit origins and enforces a production secret', () => {
  assert.deepEqual(readAuthServerConfig({
    BETTER_AUTH_URL: 'https://app.example.com',
    BETTER_AUTH_SECRET: 'development-secret',
    BETTER_AUTH_TRUSTED_ORIGINS: 'https://admin.example.com, https://app.example.com',
    NODE_ENV: 'development',
  }), {
    baseURL: 'https://app.example.com',
    secret: 'development-secret',
    trustedOrigins: ['https://app.example.com', 'https://admin.example.com'],
  });

  assert.throws(() => readAuthServerConfig({
    BETTER_AUTH_URL: 'https://app.example.com',
    BETTER_AUTH_SECRET: 'short',
    NODE_ENV: 'production',
  }), /at least 32 characters/);

  assert.throws(() => readAuthServerConfig({
    BETTER_AUTH_URL: 'https://app.example.com',
    BETTER_AUTH_SECRET: 'development-secret',
    BETTER_AUTH_TRUSTED_ORIGINS: 'https://app.example.com/callback',
    NODE_ENV: 'development',
  }), /exact HTTP\(S\) origins/);

  assert.throws(() => readAuthServerConfig({
    BETTER_AUTH_URL: 'http://app.example.com',
    BETTER_AUTH_SECRET: 'a-secure-production-secret-with-32-characters',
    NODE_ENV: 'production',
  }), /HTTPS in production/);
});

test('sign-up access policy defaults to open locally and accepts an explicit closed mode', () => {
  assert.deepEqual(readAuthAccessPolicyConfig({}), { allowSignUp: true });
  assert.deepEqual(
    readAuthAccessPolicyConfig({ AUTH_ALLOW_SIGN_UP: 'false' }),
    { allowSignUp: false },
  );
  assert.throws(
    () => readAuthAccessPolicyConfig({ AUTH_ALLOW_SIGN_UP: 'sometimes' }),
    /AUTH_ALLOW_SIGN_UP/,
  );
});

test('closed sign-up policy blocks only the email registration endpoint', async () => {
  const signUpResponse = enforceAuthAccessPolicy(
    new Request('https://app.example.com/api/auth/sign-up/email', { method: 'POST' }),
    false,
  );
  assert.equal(signUpResponse?.status, 403);
  assert.equal(signUpResponse?.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await signUpResponse?.json(), {
    error: {
      code: 'SIGN_UP_DISABLED',
      message: 'Registration is closed.',
    },
  });

  assert.equal(enforceAuthAccessPolicy(
    new Request('https://app.example.com/api/auth/sign-in/email', { method: 'POST' }),
    false,
  ), null);
  assert.equal(enforceAuthAccessPolicy(
    new Request('https://app.example.com/api/auth/sign-up/email', { method: 'POST' }),
    true,
  ), null);
});

test('route policy uses segment boundaries for public endpoints', () => {
  assert.equal(isPublicPagePath('/login'), true);
  assert.equal(isGuestOnlyPagePath('/login'), true);
  assert.equal(isPublicPagePath('/check-email'), true);
  assert.equal(isPublicPagePath('/forgot-password'), true);
  assert.equal(isPublicPagePath('/reset-password'), true);
  assert.equal(isPublicPagePath('/verify-email'), true);
  assert.equal(isGuestOnlyPagePath('/verify-email'), false);
  assert.equal(isPublicPagePath('/login/reset'), false);
  assert.equal(isPublicApiPath('/api/auth/sign-in/email'), true);
  assert.equal(isPublicApiPath('/api/health/ready'), true);
  assert.equal(isPublicApiPath('/api/auth-private'), false);
  assert.equal(isPublicApiPath('/api/healthcheck'), false);
});

test('post-auth redirect allows local product pages and rejects open redirects', () => {
  assert.equal(getSafePostAuthPath('/projects/abc?tab=files#node'), '/projects/abc?tab=files#node');
  assert.equal(getSafePostAuthPath('https://evil.example/path'), '/');
  assert.equal(getSafePostAuthPath('//evil.example/path'), '/');
  assert.equal(getSafePostAuthPath('/\\evil.example/path'), '/');
  assert.equal(getSafePostAuthPath('/api/projects'), '/');
  assert.equal(getSafePostAuthPath('/login'), '/');
  assert.equal(getSafePostAuthPath('/reset-password?token=secret'), '/');
});

test('auth UI maps only known codes and never returns provider messages', () => {
  assert.equal(
    formatAuthError({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'database password=secret' }),
    'Неверный email или пароль.',
  );
  assert.equal(
    formatAuthError({ code: 'SQL_CONNECTION_FAILED', message: 'postgres://secret' }),
    'Не удалось выполнить запрос. Проверьте данные и попробуйте ещё раз.',
  );
  assert.equal(
    formatAuthError({ status: 429, message: 'Too many requests' }),
    'Слишком много попыток. Подождите минуту и попробуйте снова.',
  );
});

test('terms acceptance requires true and the current version before creating a user', () => {
  const acceptedAt = new Date('2026-07-16T08:00:00.000Z');
  const fields = createTermsAcceptanceAdditionalFields(() => acceptedAt);

  assert.equal(fields.termsAccepted.validator.input.safeParse(true).success, true);
  assert.equal(fields.termsAccepted.validator.input.safeParse(false).success, false);
  assert.equal(fields.termsVersion.validator.input.safeParse(CURRENT_TERMS_VERSION).success, true);
  assert.equal(fields.termsVersion.validator.input.safeParse('legacy-version').success, false);
  assert.equal(fields.termsAccepted.transform.input(), acceptedAt);
  assert.equal(fields.termsAccepted.fieldName, 'termsAcceptedAt');
  assert.equal(fields.termsAccepted.returned, false);
  assert.equal(fields.termsVersion.returned, false);
});

test('Better Auth rejects unaccepted terms and stores a server timestamp for accepted terms', async () => {
  const acceptedAt = new Date('2026-07-16T08:00:00.000Z');
  const memoryDatabase: Record<string, Array<Record<string, unknown>>> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  };
  const auth = betterAuth({
    baseURL: 'http://localhost:3004',
    secret: 'test-secret-long-enough-to-avoid-auth-warnings',
    database: memoryAdapter(memoryDatabase),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    user: {
      additionalFields: createTermsAcceptanceAdditionalFields(() => acceptedAt),
    },
  });

  const rejected = await sendSignUp(auth.handler, {
    termsAccepted: false,
    termsVersion: CURRENT_TERMS_VERSION,
  });
  assert.equal(rejected.status, 400);
  assert.equal(memoryDatabase.user.length, 0);

  const staleVersion = await sendSignUp(auth.handler, {
    termsAccepted: true,
    termsVersion: 'legacy-version',
  });
  assert.equal(staleVersion.status, 400);
  assert.equal(memoryDatabase.user.length, 0);

  const missingAcceptance = await sendSignUp(auth.handler, {
    termsVersion: CURRENT_TERMS_VERSION,
  });
  assert.equal(missingAcceptance.status, 400);
  assert.equal(memoryDatabase.user.length, 0);

  const accepted = await sendSignUp(auth.handler, {
    termsAccepted: true,
    termsVersion: CURRENT_TERMS_VERSION,
  });
  assert.equal(accepted.status, 200);
  assert.equal(memoryDatabase.user.length, 1);
  assert.deepEqual(memoryDatabase.user[0]?.termsAcceptedAt, acceptedAt);
  assert.equal(memoryDatabase.user[0]?.termsVersion, CURRENT_TERMS_VERSION);

  const responseBody = await accepted.json() as { user: Record<string, unknown> };
  assert.equal('termsAccepted' in responseBody.user, false);
  assert.equal('termsAcceptedAt' in responseBody.user, false);
  assert.equal('termsVersion' in responseBody.user, false);
});

test('workspace bootstrap failure is retryable and does not escape into sign-up', async () => {
  const reports: string[] = [];
  const user = { id: 'user-1', email: 'user@example.com', name: 'User' };

  const result = await attemptPersonalWorkspaceBootstrap(
    user,
    async () => {
      throw new Error('database connection string');
    },
    (userId) => reports.push(userId),
  );

  assert.equal(result, false);
  assert.deepEqual(reports, ['user-1']);
});

test('auth route fallback hides unexpected server failures', async () => {
  let reported = false;
  const response = await handleAuthRequestSafely(
    new Request('https://app.example.com/api/auth/sign-in/email'),
    async () => {
      throw new Error('postgres://user:password@database/internal');
    },
    () => {
      reported = true;
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(reported, true);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'auth_unavailable',
      message: 'Authentication service is temporarily unavailable.',
    },
  });
});

function sendSignUp(
  handler: (request: Request) => Promise<Response>,
  terms: { termsAccepted?: boolean; termsVersion?: string },
) {
  return handler(new Request('http://localhost:3004/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3004',
    },
    body: JSON.stringify({
      name: 'Terms User',
      email: 'terms@example.com',
      password: 'correct-horse-battery-staple',
      ...terms,
    }),
  }));
}
