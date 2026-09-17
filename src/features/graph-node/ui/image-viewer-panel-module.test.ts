import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageViewerPanelModule } from './image-viewer-panel-module';

test('panel adapter preserves active sidebar metadata and host render content', () => {
  const descriptor = createImageViewerPanelModule({ active: true, placement: 'right', label: 'Curves',
    className: 'image-editor-panel-curves', height: 260, toolbar: 'controls', body: 'curve editor' }, 'adjusted preview');
  assert.deepEqual(descriptor, { id: 'image-production-panel', active: true, placement: 'right', label: 'Curves',
    className: 'image-editor-panel-curves', height: 260, toolbar: 'controls', body: 'curve editor', media: 'adjusted preview' });
  assert.equal(descriptor?.lockNavigation, undefined);
});

test('toolbar-only library module remains inactive and independent of mask state', () => {
  const descriptor = createImageViewerPanelModule({ active: false, toolbar: 'library actions', body: null });
  assert.equal(descriptor?.active, false);
  assert.equal(descriptor?.toolbar, 'library actions');
  assert.equal(descriptor?.media, undefined);
});

test('media-only adapter handles video previews without requiring an editor panel', () => {
  assert.equal(createImageViewerPanelModule(), undefined);
  const descriptor = createImageViewerPanelModule(undefined, 'video player');
  assert.equal(descriptor?.active, true);
  assert.equal(descriptor?.media, 'video player');
  assert.equal(descriptor?.body, undefined);
});
