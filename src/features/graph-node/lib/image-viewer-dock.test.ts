import assert from 'node:assert/strict';
import test from 'node:test';
import { dockIndex, dockWindowSize, IMAGE_DOCK_PITCH } from './image-viewer-dock';
import { getImageViewerThumbnailWindow } from './image-viewer-thumbnail-window';

test('drag snaps to the nearest item and clamps both collection boundaries', () => {
  assert.equal(dockIndex(2.49 * IMAGE_DOCK_PITCH, 200), 2);
  assert.equal(dockIndex(2.51 * IMAGE_DOCK_PITCH, 200), 3);
  assert.equal(dockIndex(-100, 200), 0);
  assert.equal(dockIndex(100_000, 200), 199);
  assert.equal(dockIndex(96, 1), 0);
});

test('full-width strip mounts only viewport thumbnails plus a small overscan', () => {
  const ids = Array.from({ length: 10_000 }, (_, i) => String(i));
  for (const width of [375, 1440, 2560, 3840]) {
    const entries = getImageViewerThumbnailWindow(ids, 500, dockWindowSize(width));
    assert.equal(entries.length, Math.ceil(width / IMAGE_DOCK_PITCH) + 8);
    assert.ok(entries.some((entry) => entry.index === 500));
  }
});
