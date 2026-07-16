import assert from 'node:assert/strict';
import test from 'node:test';
import { readAuthServerConfig } from './config';
import { formatAuthError } from './error-message';
import { handleAuthRequestSafely } from './handler';
import { getSafePostAuthPath, isPublicApiPath, isPublicPagePath } from './route-policy';
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

test('route policy uses segment boundaries for public endpoints', () => {
  assert.equal(isPublicPagePath('/login'), true);
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
