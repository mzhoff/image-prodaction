import assert from 'node:assert/strict';
import test from 'node:test';
import { createLibraryImageLink, createLibraryProjectLink, createLibraryProjectBatchLink, loadLibraryImageReference, readLibraryImageLink, readLibraryProjectImport, readLibraryProjectImports } from './library-image-reference';

const assetId = '019b48b0-40e7-7a1b-8000-000000000010';
const workspaceId = '019b48b0-40e7-7a1b-8000-000000000001';
const origin = 'http://127.0.0.1:7310';
const asset = { id: assetId, workspaceId, status: 'ready', libraryVisible: true, mediaKind: 'image', contentType: 'image/png', originalName: 'image.png', createdAt: '2026-09-08T00:00:00.000Z', width: 1600, height: 900 };

test('batch intents deduplicate assets, preserve stable identities and accept legacy single links', () => {
  const href = createLibraryProjectBatchLink(workspaceId, [assetId, assetId, workspaceId], assetId);
  assert.deepEqual(readLibraryProjectImports(href.split('?')[1]), [
    { assetId, nodeId: `library-import-${assetId}` }, { assetId: workspaceId, nodeId: `library-import-${assetId}-1` },
  ]);
  const legacy = createLibraryProjectLink(workspaceId, assetId, assetId).split('?')[1];
  assert.deepEqual(readLibraryProjectImports(legacy), [readLibraryProjectImport(legacy)]);
  assert.throws(() => createLibraryProjectBatchLink(workspaceId, [], assetId));
  assert.throws(() => createLibraryProjectBatchLink(workspaceId, Array(101).fill(assetId), assetId));
  assert.equal(readLibraryProjectImports(`importAsset=bad&importRequest=${assetId}`), null);
  assert.equal(readLibraryProjectImports(`importAsset=${assetId}`), null);
});

test('clipboard uses stable same-origin authenticated original URL, not arbitrary URL imports', () => {
  const link = createLibraryImageLink(assetId, origin);
  assert.equal(link, `${origin}/api/assets/${assetId}/content`);
  assert.equal(readLibraryImageLink(` ${link}\n`, origin), assetId);
  for (const invalid of [link + '?variant=thumbnail', link + '#x', link.replace(origin, 'https://evil.example'), link.replace('127.0.0.1', 'user:password@127.0.0.1'), 'data:image/png;base64,aaa', '/api/assets/' + assetId + '/content', 'Hello', link.replace(assetId, '..')]) {
    assert.equal(readLibraryImageLink(invalid, origin), null);
  }
});
test('project intent has stable unique insertion identity and rejects invalid IDs', () => {
  const href = createLibraryProjectLink(workspaceId, assetId, assetId);
  assert.deepEqual(readLibraryProjectImport(href.split('?')[1]), { assetId, nodeId: `library-import-${assetId}` });
  assert.equal(readLibraryProjectImport('importAsset=bad&importRequest=no'), null);
});
test('fresh authorized metadata maps to the existing original without fetching/uploading bytes', async () => {
  let calls = 0;
  const mapped = await loadLibraryImageReference(assetId, workspaceId, undefined, async (url, init) => {
    calls++;
    assert.equal(url, `/api/assets/${assetId}?view=library`);
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.redirect, 'error');
    return Response.json({ asset });
  });
  assert.equal(calls, 1);
  assert.deepEqual(mapped.storage, { type: 'remote', assetId });
  assert.equal(mapped.width, 1600);
});
test('rejects unavailable, mismatched, cross-workspace, nonimage and unpublished assets', async () => {
  for (const patch of [{ workspaceId: 'other' }, { id: 'other' }, { status: 'deleted' }, { mediaKind: 'audio' }, { contentType: 'image/svg+xml' }, { libraryVisible: false }]) {
    await assert.rejects(loadLibraryImageReference(assetId, workspaceId, undefined, async () => Response.json({ asset: { ...asset, ...patch } })));
  }
  for (const status of [401, 403, 404, 500]) {
    await assert.rejects(loadLibraryImageReference(assetId, workspaceId, undefined, async () => new Response(null, { status })));
  }
});
