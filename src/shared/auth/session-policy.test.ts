import assert from 'node:assert/strict';
import test from 'node:test';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import {
  AUTH_COOKIE_PREFIX,
  AUTH_SESSION_TTL_SECONDS,
  AUTH_SESSION_UPDATE_AGE_SECONDS,
  authSessionPolicy,
} from './session-policy';

const imageOrigin = 'http://localhost:3004';
const hubOrigin = 'http://localhost:13001';
type Database = Record<string, Array<Record<string, unknown>>>;

function createTestAuth(origin = imageOrigin, isolated = true, database: Database = {
  user: [], session: [], account: [], verification: [],
}) {
  const auth = betterAuth({
    ...(isolated ? authSessionPolicy : {}),
    baseURL: origin,
    secret: `test-only-${origin}-abcdefghijklmnopqrstuvwxyz-0123456789`,
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    trustedOrigins: [origin],
  });
  return { auth, database, origin };
}

// Host-only Path=/ cookies, as emitted by our auth config. Deliberately ignore
// ports, matching browser behavior; values never leave this in-memory fixture.
class CookieJar {
  private cookies = new Map<string, string>();

  header(origin: string) {
    const prefix = `${new URL(origin).hostname}|`;
    return [...this.cookies].filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => `${key.slice(prefix.length)}=${value}`).join('; ');
  }

  apply(origin: string, response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      assert.match(cookie, /; Path=\/(?:;|$)/i);
      assert.doesNotMatch(cookie, /; Domain=/i);
      const pair = cookie.split(';')[0];
      const separator = pair.indexOf('=');
      const key = `${new URL(origin).hostname}|${pair.slice(0, separator)}`;
      if (/; Max-Age=0(?:;|$)/i.test(cookie)) this.cookies.delete(key);
      else this.cookies.set(key, pair.slice(separator + 1));
    }
  }
}

async function request(app: ReturnType<typeof createTestAuth>, jar: CookieJar,
  path: string, body?: Record<string, unknown>) {
  const response = await app.auth.handler(new Request(`${app.origin}/api/auth/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { origin: app.origin, 'content-type': 'application/json', cookie: jar.header(app.origin) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  jar.apply(app.origin, response);
  return response;
}

async function register(app: ReturnType<typeof createTestAuth>, jar: CookieJar) {
  const response = await request(app, jar, 'sign-up/email', {
    name: 'Session policy test', email: 'session@example.test', password: 'Test-only-password-123!',
  });
  assert.equal(response.status, 200);
  return response;
}

async function isSignedIn(app: ReturnType<typeof createTestAuth>, jar: CookieJar) {
  const response = await request(app, jar, 'get-session');
  assert.equal(response.status, 200);
  return Boolean((await response.json())?.session);
}

test('regression proof: default cookies collide between two apps on different ports', async () => {
  const image = createTestAuth(imageOrigin, false);
  const hub = createTestAuth(hubOrigin, false);
  const jar = new CookieJar();
  await register(image, jar);
  assert.equal(await isSignedIn(image, jar), true);
  await register(hub, jar);
  assert.equal(await isSignedIn(hub, jar), true);
  assert.equal(await isSignedIn(image, jar), false);
  assert.equal(image.database.session.length, 1, 'The session still exists; it did not expire.');
});

test('product cookies isolate sign-in and sign-out in both directions', async () => {
  const image = createTestAuth();
  const hub = createTestAuth(hubOrigin, false);
  const jar = new CookieJar();
  await register(image, jar);
  await register(hub, jar);
  assert.equal(await isSignedIn(image, jar), true);
  assert.equal(await isSignedIn(hub, jar), true);
  await request(hub, jar, 'sign-out', {});
  assert.equal(await isSignedIn(hub, jar), false);
  assert.equal(await isSignedIn(image, jar), true);
  await request(hub, jar, 'sign-in/email', {
    email: 'session@example.test', password: 'Test-only-password-123!', rememberMe: true,
  });
  await request(image, jar, 'sign-out', {});
  assert.equal(await isSignedIn(image, jar), false);
  assert.equal(await isSignedIn(hub, jar), true);
});

test('migration neither accepts nor clears a legacy cookie owned by another app', async () => {
  const image = createTestAuth();
  const hub = createTestAuth(hubOrigin, false);
  const jar = new CookieJar();
  await register(hub, jar);
  assert.equal(await isSignedIn(image, jar), false);
  const response = await request(image, jar, 'sign-out', {});
  assert.ok(response.headers.getSetCookie().every((cookie) => !cookie.startsWith('better-auth.')));
  assert.equal(await isSignedIn(hub, jar), true);
});

test('cookies persist seven days, stay HttpOnly and SameSite=Lax, and use Secure on HTTPS', async () => {
  for (const origin of [imageOrigin, 'https://image.example.test']) {
    const app = createTestAuth(origin);
    const response = await register(app, new CookieJar());
    const cookie = response.headers.getSetCookie().find((item) => item.includes('.session_token='));
    assert.ok(cookie);
    const secure = origin.startsWith('https:');
    assert.ok(cookie.startsWith(`${secure ? '__Secure-' : ''}${AUTH_COOKIE_PREFIX}.session_token=`));
    assert.match(cookie, /; HttpOnly(?:;|$)/i);
    assert.match(cookie, /; SameSite=Lax(?:;|$)/i);
    assert.match(cookie, new RegExp(`; Max-Age=${AUTH_SESSION_TTL_SECONDS}(?:;|$)`, 'i'));
    assert.equal(/; Secure(?:;|$)/i.test(cookie), secure);
    assert.ok(!response.headers.getSetCookie().some((item) => item.includes('.session_data=')));
  }
});

test('server recreation with the same database and secret preserves the session', async () => {
  const app = createTestAuth();
  const jar = new CookieJar();
  await register(app, jar);
  const restarted = createTestAuth(imageOrigin, true, app.database);
  assert.equal(await isSignedIn(restarted, jar), true);
});

test('active session renews its database expiry and persistent cookie after one day', async () => {
  const app = createTestAuth();
  const jar = new CookieJar();
  await register(app, jar);
  const session = app.database.session[0];
  const age = (AUTH_SESSION_UPDATE_AGE_SECONDS + 60) * 1000;
  session.createdAt = new Date(Date.now() - age);
  session.updatedAt = session.createdAt;
  session.expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_SECONDS * 1000 - age);
  const before = (session.expiresAt as Date).getTime();
  const response = await request(app, jar, 'get-session');
  assert.equal(response.status, 200);
  const refreshed = await response.json();
  assert.ok(new Date(refreshed.session.expiresAt).getTime() > before + age - 5_000);
  assert.ok(response.headers.getSetCookie().some((item) => item.includes(`Max-Age=${AUTH_SESSION_TTL_SECONDS}`)));
});

test('expired and revoked sessions cannot be restored from a retained cookie', async () => {
  for (const revoked of [false, true]) {
    const app = createTestAuth();
    const jar = new CookieJar();
    await register(app, jar);
    if (revoked) app.database.session.splice(0);
    else app.database.session[0].expiresAt = new Date(Date.now() - 1000);
    assert.equal(await isSignedIn(app, jar), false);
  }
});
