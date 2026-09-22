import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { StoryError } from '@/modules/story-projects/server/story-service';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(['next/headers', 'next/navigation'].includes(specifier) ? `${specifier}.js` : specifier, context);
} });
const { timelineProductionRequest } = await import('./timeline-production-routes');

const timelineId = randomUUID(), jobId = randomUUID();
type Deps = NonNullable<Parameters<typeof timelineProductionRequest>[2]>;
const base: Deps = { origins: () => ['http://localhost'], session: async () => ({ user: { id: 'user' } } as Awaited<ReturnType<NonNullable<Deps['session']>>>) };
const request = (method: string, body?: unknown, origin = 'http://localhost') => new Request('http://localhost/api/timeline', { method,
  headers: { origin, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
test('timeline production rejects cross-origin mutation and invalid parameters before submission', async () => {
  let calls = 0;
  const submit: Deps['submit'] = async () => { calls++; throw new Error('not expected'); };
  const address = { timelineId, action: 'jobs' as const };
  assert.equal((await timelineProductionRequest(request('POST', {}, 'https://outsider.test'), address, { ...base, submit })).status, 403);
  assert.equal((await timelineProductionRequest(request('POST', { action: 'render', expectedRevision: -1 }), address, { ...base, submit })).status, 422);
  assert.equal(calls, 0);
});
test('apply reports revision conflict and downloadable MP4 is gated by successful scoped render', async () => {
  const response = await timelineProductionRequest(request('POST', { expectedRevision: 1 }), { timelineId, jobId, action: 'apply' }, {
    ...base, apply: async () => { throw new StoryError('Changed', 409, 'revision_conflict'); },
  });
  assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'revision_conflict');
  const denied = await timelineProductionRequest(request('GET'), { timelineId, jobId, action: 'download' }, {
    ...base, readInternal: async () => ({ job: { status: 'running' }, result: null } as Awaited<ReturnType<NonNullable<Deps['readInternal']>>>),
    content: async () => { throw new Error('must not read storage'); },
  });
  assert.equal(denied.status, 409);
  const workspaceId = randomUUID(), assetId = randomUUID();
  const download = await timelineProductionRequest(request('GET'), { timelineId, jobId, action: 'download' }, {
    ...base, readInternal: async () => ({ job: { id: jobId, workspaceId, status: 'succeeded' }, result: { kind: 'render', assetId } } as Awaited<ReturnType<NonNullable<Deps['readInternal']>>>),
    content: async () => ({ asset: { workspaceId, generationJobId: jobId, mediaKind: 'video' }, contentType: 'video/mp4', byteSize: 4, range: undefined,
      object: { body: new Response(new Uint8Array([1, 2, 3, 4])).body! } } as Awaited<ReturnType<NonNullable<Deps['content']>>>),
  });
  assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition')!, /attachment/);
  assert.equal((await download.arrayBuffer()).byteLength, 4);
});
