import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimelineRoutes } from './handler';

const workspaceId = '019aaaaa-0000-7000-8000-000000000001';
const documentId = '019aaaaa-0000-7000-8000-000000000002';
const assetId = '019aaaaa-0000-7000-8000-000000000003';
const jobId = '019aaaaa-0000-7000-8000-000000000004';
const body = { action: 'analyze', workspaceId, documentId, assetId, idempotencyKey: 'request-1', threshold: 10 };
const makeRequest = (value: unknown, origin = 'http://localhost:3004') => new Request('http://localhost:3004/api/timeline', {
  method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(value),
});
function setup() {
  const calls: unknown[] = [];
  const response = { job: { id: jobId, workspaceId, status: 'queued', error: null }, result: null } as unknown as Awaited<ReturnType<Parameters<typeof createTimelineRoutes>[0]['submit']>>;
  const routes = createTimelineRoutes({ trustedOrigins: () => ['http://localhost:3004'], userId: async () => 'actor',
    submit: async (actor, input) => { calls.push({ actor, input }); return response; },
    read: async (actor, id) => { calls.push({ actor, id }); return response; },
    error: () => Response.json({ error: 'blocked' }, { status: 403 }),
  });
  return { ...routes, calls };
}
test('trusted analyzed video submission queues only the authorized request and returns no-store', async () => {
  const route = setup(); const result = await route.post(makeRequest(body));
  assert.equal(result.status, 202); assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(route.calls, [{ actor: 'actor', input: body }]);
});
test('untrusted origin, arbitrary URLs and out-of-range thresholds are rejected before submission', async () => {
  const route = setup();
  assert.equal((await route.post(makeRequest(body, 'https://evil.example'))).status, 403);
  assert.equal((await route.post(makeRequest({ ...body, videoUrl: 'http://internal.example/secret' }))).status, 400);
  assert.equal((await route.post(makeRequest({ ...body, threshold: 0 }))).status, 400);
  assert.equal((await route.post(makeRequest({ ...body, assetId: '../../file' }))).status, 400);
  assert.equal(route.calls.length, 0);
});
test('job reads preserve actor identity for server access checks; malformed IDs rejected', async () => {
  const route = setup(); const request = new Request(`http://localhost:3004/api/timeline/jobs/${jobId}`);
  assert.equal((await route.get(request, 'invalid')).status, 400);
  assert.equal((await route.get(request, jobId)).status, 200);
  assert.deepEqual(route.calls, [{ actor: 'actor', id: jobId }]);
});
