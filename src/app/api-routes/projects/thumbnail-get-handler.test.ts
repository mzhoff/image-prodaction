import assert from 'node:assert/strict';
import test from 'node:test';
import { getContentHubStarterPreset } from '@/entities/production-graph/model/content-hub-starter-preset';
import { createGetProjectThumbnailHandler } from './thumbnail-get-handler';

const projectId = '524e8cb9-39a5-5e3b-ac91-5bf3a6ff9089';
function fixture() {
  const calls: string[] = [];
  const dependencies: Parameters<typeof createGetProjectThumbnailHandler>[0] = {
    userId: async () => { calls.push('session'); return 'member'; },
    getDocument: async (userId, id) => {
      calls.push('membership'); assert.equal(userId, 'member'); assert.equal(id, projectId);
      return { id, revision: 1, snapshot: getContentHubStarterPreset()[0].snapshot } as Awaited<ReturnType<typeof dependencies.getDocument>>;
    },
    toErrorResponse: (error) => Response.json({ error: 'denied' }, { status: (error as { status: number }).status }),
  };
  return { dependencies, calls };
}
function request(etag?: string) {
  return new Request(`http://internal/api/projects/${projectId}/thumbnail`, { headers: etag ? { 'If-None-Match': etag } : {} });
}

test('generated preview is private, inert and revalidated only after workspace authorization', async () => {
  const setup = fixture();
  const handler = createGetProjectThumbnailHandler(setup.dependencies);
  const response = await handler(request(), projectId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'private, no-cache');
  assert.match(response.headers.get('content-security-policy')!, /sandbox/);
  assert.match(await response.text(), /<svg/);
  assert.equal((await handler(request(response.headers.get('etag')!), projectId)).status, 304);
  assert.deepEqual(setup.calls, ['session', 'membership', 'session', 'membership']);
});

test('absent session and inaccessible workspace cannot obtain even a cached preview', async () => {
  for (const status of [401, 404]) {
    const setup = fixture();
    if (status === 401) setup.dependencies.userId = async () => { throw { status }; };
    else setup.dependencies.getDocument = async () => { throw { status }; };
    const result = await createGetProjectThumbnailHandler(setup.dependencies)(request(`"graph-1-${projectId}-1"`), projectId);
    assert.equal(result.status, status);
    assert.doesNotMatch(await result.text(), /<svg/);
  }
});

test('invalid identifiers and empty documents return safe errors', async () => {
  const setup = fixture();
  const handler = createGetProjectThumbnailHandler(setup.dependencies);
  assert.equal((await handler(request(), '../another')).status, 400);
  assert.deepEqual(setup.calls, []);
  const get = setup.dependencies.getDocument;
  setup.dependencies.getDocument = async (user, id) => ({ ...await get(user, id), snapshot: undefined });
  assert.equal((await handler(request(), projectId)).status, 404);
});
