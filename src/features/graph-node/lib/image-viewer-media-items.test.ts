import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { createImageViewerMediaItems } from './image-viewer-media-items';

const remote: AssetRecord = { id: 'graph-result', kind: 'image', name: 'Result.png', mimeType: 'image/png',
  width: 900, height: 1350, createdAt: '2026-09-10T10:00:00Z', storage: { type: 'remote', assetId: 'remote/id' } };
const legacy: AssetRecord = { ...remote, id: 'legacy', storage: { type: 'indexeddb', blobKey: 'blob-1' } };

test('viewer adapter preserves graph IDs while resolving remote storage IDs and active original URL', () => {
  const result = createImageViewerMediaItems({ assets: [remote], assetId: remote.id, currentIndex: 0,
    historyAssetIds: [remote.id, 'another'], url: 'blob:currently-displayed' });
  assert.equal(result.selectedId, remote.id);
  assert.deepEqual(result.items.map((item) => item.id), [remote.id, 'another']);
  assert.equal(result.items[0].url, 'blob:currently-displayed');
  assert.equal(result.items[0].thumbnailUrl, '/api/assets/remote%2Fid/content?variant=thumbnail');
  assert.equal(result.items[0].width, 900);
  assert.equal(result.items[1].url, '/api/assets/another/content');
});

test('library-supplied URLs and metadata take precedence over graph assets', () => {
  const result = createImageViewerMediaItems({ assets: [remote], currentIndex: 1,
    historyAssetIds: ['library', remote.id], url: 'https://media.test/original', items: [
      { id: 'library', url: 'https://media.test/library', thumbnailUrl: 'https://media.test/thumb', name: 'Library title', width: 123, height: 456 },
      { id: remote.id, url: 'https://media.test/original', width: 2400, height: 1600 },
    ] });
  assert.equal(result.selectedId, remote.id);
  assert.equal(result.items[0].url, 'https://media.test/library');
  assert.equal(result.items[0].thumbnailUrl, 'https://media.test/thumb');
  assert.equal(result.items[0].name, 'Library title');
  assert.equal(result.items[1].width, 2400);
  assert.equal(result.items[1].thumbnailUrl, 'https://media.test/original');
});

test('IndexedDB items never invent a remote route or reuse a thumbnail for an older blob', () => {
  const options = { assets: [legacy], assetId: 'active', currentIndex: 0,
    historyAssetIds: ['active', legacy.id], url: 'blob:active' };
  const missing = createImageViewerMediaItems(options);
  assert.equal(missing.items[1].url, '');
  assert.equal(missing.items[1].thumbnailUrl, undefined);
  const stale = createImageViewerMediaItems({ ...options, thumbnails: new Map([
    [legacy.id, { blobKey: 'old-blob', url: 'blob:stale-thumbnail' }],
  ]) });
  assert.equal(stale.items[1].url, '');
  const loaded = createImageViewerMediaItems({ ...options, thumbnails: new Map([
    [legacy.id, { blobKey: 'blob-1', url: 'blob:thumbnail' }],
  ]) });
  assert.equal(loaded.items[1].url, 'blob:thumbnail');
  assert.equal(loaded.items[1].thumbnailUrl, 'blob:thumbnail');
});

test('a single image without history remains visible with its actual URL', () => {
  const result = createImageViewerMediaItems({ asset: remote, assets: [], assetId: remote.id,
    currentIndex: 0, historyAssetIds: [], url: 'blob:original' });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, result.selectedId);
  assert.equal(result.items[0].url, 'blob:original');
  assert.equal(result.items[0].height, 1350);
});
