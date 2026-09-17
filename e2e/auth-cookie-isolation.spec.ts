import { createServer } from 'node:http';
import { once } from 'node:events';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { expect, test, type Page } from '@playwright/test';
import { authSessionPolicy } from '../src/shared/auth/session-policy';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Real Chromium cookie storage, two HTTP origins, no product DB or user accounts.
test('logging in and out of a neighboring app preserves the Image Production session', async ({ page }) => {
  const image = await startAuthHost(true);
  const hub = await startAuthHost(false);
  try {
    await register(page, image.origin);
    await register(page, hub.origin);
    expect(await signedIn(page, image.origin)).toBe(true);
    expect(await signedIn(page, hub.origin)).toBe(true);
    await call(page, hub.origin, 'sign-out', {});
    expect(await signedIn(page, hub.origin)).toBe(false);
    expect(await signedIn(page, image.origin)).toBe(true);
    await call(page, hub.origin, 'sign-in/email', credentials);
    await call(page, image.origin, 'sign-out', {});
    expect(await signedIn(page, image.origin)).toBe(false);
    expect(await signedIn(page, hub.origin)).toBe(true);
  } finally {
    await Promise.all([image.close(), hub.close()]);
  }
});

const credentials = { email: 'cookie-isolation@example.test', password: 'Test-only-password-123!', rememberMe: true };

async function register(page: Page, origin: string) {
  const result = await call(page, origin, 'sign-up/email', { ...credentials, name: 'Cookie isolation test' });
  expect(result.status).toBe(200);
}

async function signedIn(page: Page, origin: string) {
  return (await call(page, origin, 'get-session')).signedIn;
}

async function call(page: Page, origin: string, path: string, body?: Record<string, unknown>) {
  await page.goto(origin);
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(`/api/auth/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    return { status: response.status, signedIn: Boolean(data?.session) };
  }, { path, body });
}

async function startAuthHost(isolated: boolean) {
  const server = createServer(async (incoming, outgoing) => {
    if (!incoming.url?.startsWith('/api/auth/')) {
      outgoing.setHeader('Content-Type', 'text/html');
      outgoing.end('<!doctype html><title>Isolated auth fixture</title>');
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const response = await handler(new Request(`http://${incoming.headers.host}${incoming.url}`, {
        method: incoming.method, headers,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      }));
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => { if (key !== 'set-cookie') outgoing.setHeader(key, value); });
      outgoing.setHeader('set-cookie', response.headers.getSetCookie());
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.statusCode = 500;
      outgoing.end('Auth fixture failed');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  const origin = `http://127.0.0.1:${address.port}`;
  const handler = betterAuth({
    ...(isolated ? authSessionPolicy : { advanced: { cookiePrefix: 'content-hub' } }),
    baseURL: origin,
    secret: `test-only-${origin}-abcdefghijklmnopqrstuvwxyz-0123456789`,
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
  }).handler;
  return {
    origin,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
