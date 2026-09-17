import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetDto } from '@/entities/asset/server/asset-service-contracts';
import { createTimelineFrameRequest } from './frame-handler';

const workspaceId = '019f0000-0000-7000-8000-000000000001';
const assetId = '019f0000-0000-7000-8000-000000000003';
const base = `http://local/api/timeline/frame?workspaceId=${workspaceId}&assetId=${assetId}&timeMs=700`;
test('private JSON materializes the same still as JPEG after session and Workspace authorization', async () => {
  const events: string[] = [];
  const asset = { id: 'image-id', mediaKind: 'image', workspaceId, contentUrl: '/api/assets/image-id/content' } as AssetDto;
  const handle = createTimelineFrameRequest({
    userId: async () => { events.push('session'); return 'user'; },
    authorize: async (user, workspace) => { events.push('authorize'); assert.equal(user, 'user'); assert.equal(workspace, workspaceId); },
    frame: async (input) => { events.push('frame'); assert.equal(input.timeMs, 700); assert.equal(input.assetId, assetId); assert.equal(input.userId, 'user'); return { assetId: asset.id, bytes: new Uint8Array([255, 216, 255, 217]) }; },
    metadata: async (user, id) => { events.push('metadata'); assert.equal(user, 'user'); assert.equal(id, asset.id); return asset; }, error: () => new Response(null, { status: 403 }),
  });
  const json = await handle(new Request(`${base}&format=json`));
  assert.deepEqual(await json.json(), { asset }); assert.equal(json.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(events, ['session', 'authorize', 'frame', 'metadata']); events.length = 0;
  const image = await handle(new Request(base)); assert.equal(image.headers.get('Content-Type'), 'image/jpeg'); assert.equal(image.headers.get('X-Asset-Id'), asset.id);
  assert.deepEqual(events, ['session', 'authorize', 'frame']);
});

test('arbitrary URLs, invalid times and revoked membership cannot materialize frames', async () => {
  let reads = 0;
  const dependencies = { userId: async () => 'user', authorize: async () => { throw new Error('forbidden'); },
    frame: async () => { reads += 1; return { assetId: 'image', bytes: new Uint8Array() }; }, metadata: async () => ({} as AssetDto), error: () => new Response(null, { status: 403 }) };
  const handle = createTimelineFrameRequest(dependencies);
  assert.equal((await handle(new Request(`${base}&url=http://internal`))).status, 400);
  assert.equal((await handle(new Request(base.replace('timeMs=700', 'timeMs=-1')))).status, 400);
  assert.equal((await handle(new Request(`${base}&format=json`))).status, 403); assert.equal(reads, 0);
});
