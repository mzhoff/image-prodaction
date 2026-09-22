import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductAuthClient } from './client';

for (const origin of [
  'http://localhost:3004',
  'http://localhost:7310',
  'http://127.0.0.1:7310',
  'https://production.example.test',
]) {
  test(`auth SDK reads and ends the session on the page origin: ${origin}`, async (t) => {
    // A leftover canonical build-time URL must not bypass a browser's UI proxy
    // or send the request to a different hostname with different cookies.
    const previous = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL = 'http://localhost:3004';
    t.after(() => {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
      else process.env.NEXT_PUBLIC_BETTER_AUTH_URL = previous;
    });
    const requests: Array<{ url: string; method?: string; credentials?: string }> = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method, credentials: init?.credentials });
      return Response.json(url.endsWith('/sign-out') ? { success: true } : null);
    });
    const client = createProductAuthClient(origin);

    await client.getSession();
    const result = await client.signOut();

    assert.equal(result.error, null);
    assert.equal(result.data?.success, true);
    assert.deepEqual(requests, [
      { url: `${origin}/api/auth/get-session`, method: 'GET', credentials: 'include' },
      { url: `${origin}/api/auth/sign-out`, method: 'POST', credentials: 'include' },
    ]);
  });
}
