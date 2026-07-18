import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IMAGE_VIEWER_THUMBNAIL_WINDOW_SIZE,
  getImageViewerThumbnailWindow,
} from './image-viewer-thumbnail-window';

const assetIds = Array.from({ length: 83 }, (_, index) => `asset-${index}`);

test('keeps the thumbnail DOM bounded at the beginning of a large collection', () => {
  const window = getImageViewerThumbnailWindow(assetIds, 0);

  assert.equal(window.length, IMAGE_VIEWER_THUMBNAIL_WINDOW_SIZE);
  assert.deepEqual(window[0], { assetId: 'asset-0', index: 0 });
  assert.deepEqual(window.at(-1), { assetId: 'asset-14', index: 14 });
});

test('centers the active thumbnail when possible', () => {
  const window = getImageViewerThumbnailWindow(assetIds, 41);

  assert.equal(window.length, IMAGE_VIEWER_THUMBNAIL_WINDOW_SIZE);
  assert.ok(window.some((entry) => entry.index === 41));
  assert.deepEqual(window[0], { assetId: 'asset-34', index: 34 });
  assert.deepEqual(window.at(-1), { assetId: 'asset-48', index: 48 });
});

test('keeps the last item visible without exceeding collection bounds', () => {
  const window = getImageViewerThumbnailWindow(assetIds, assetIds.length - 1);

  assert.equal(window.length, IMAGE_VIEWER_THUMBNAIL_WINDOW_SIZE);
  assert.deepEqual(window[0], { assetId: 'asset-68', index: 68 });
  assert.deepEqual(window.at(-1), { assetId: 'asset-82', index: 82 });
});

test('returns every thumbnail for a small collection', () => {
  assert.deepEqual(
    getImageViewerThumbnailWindow(['a', 'b'], 1),
    [
      { assetId: 'a', index: 0 },
      { assetId: 'b', index: 1 },
    ],
  );
});
