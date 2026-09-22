import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { handleBudgetSummary } from './budget-summary';

test('signed budget lookup rejects forged scope, stale signatures and oversized bodies', async (t) => {
  const secret = 'test-only-service-secret-'.repeat(2), issuer = 'https://identity.example/api/auth';
  const beforeSecret = process.env.PLATFORM_PROJECTION_SECRET;
  const beforeIssuer = process.env.REVERIE_IDENTITY_ISSUER;
  process.env.PLATFORM_PROJECTION_SECRET = secret;
  process.env.REVERIE_IDENTITY_ISSUER = issuer;
  t.after(() => {
    if (beforeSecret === undefined) delete process.env.PLATFORM_PROJECTION_SECRET;
    else process.env.PLATFORM_PROJECTION_SECRET = beforeSecret;
    if (beforeIssuer === undefined) delete process.env.REVERIE_IDENTITY_ISSUER;
    else process.env.REVERIE_IDENTITY_ISSUER = beforeIssuer;
  });
  const request = (body: string, path = '/v1/platform/budget-summary', time = Date.now()) => {
    const timestamp = String(time);
    const signature = createHmac('sha256', secret).update(`${timestamp}\nPOST\n${path}\n${body}`).digest('hex');
    return new Request(`https://production.example/v1/platform/budget-summary`, {
      method: 'POST', body,
      headers: { 'x-platform-timestamp': timestamp, 'x-platform-signature': signature },
    });
  };
  let called = 0;
  const lookup = async (resolvedIssuer: string, subject: string) => {
    assert.equal(resolvedIssuer, issuer); assert.equal(subject, 'identity-user'); called++; return [];
  };
  const body = JSON.stringify({ issuer, subject: 'identity-user' });
  for (const [req, status] of [
    [request(body, '/v1/platform/budget-workspaces'), 403],
    [request(body, undefined, Date.now() - 61_000), 403],
    [request(JSON.stringify({ issuer: 'https://other.example', subject: 'identity-user' })), 400],
    [request(JSON.stringify({ issuer, subject: 'identity-user', workspaceId: 'forged' })), 400],
    [request('a'.repeat(4097)), 413],
    [request('{'), 400],
  ] as const) assert.equal((await handleBudgetSummary(req, lookup)).status, status);
  assert.equal(called, 0);
  const result = await handleBudgetSummary(request(body), lookup);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { workspaces: [] });
  assert.equal(called, 1);
  const unavailable = await handleBudgetSummary(request(body), async () => { throw new Error('database secret'); });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /database secret/);
});
