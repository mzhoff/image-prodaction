import assert from 'node:assert/strict';
import test from 'node:test';
import { getExportPreviewIndex, getExportPreviewKey } from './export-preview-selection';

const item = (assetId: string, edgeId: string) => ({ assetId,
  edge: { id: edgeId, sourceNodeId: 'source', sourcePortId: 'image', targetNodeId: 'export', targetPortId: 'image-0' } });

test('Export preview initially follows the primary input current image, including upstream history', () => {
  const items = [item('old', 'edge-a'), item('current', 'edge-a'), item('other', 'edge-b')];
  assert.equal(getExportPreviewIndex(items, undefined, 'current'), 1);
  assert.equal(getExportPreviewIndex(items, getExportPreviewKey(items[2]), 'current'), 2);
});

test('Export preview keeps the selected connection/image through reordering and distinguishes duplicate files', () => {
  const first = item('same-image', 'edge-a');
  const second = item('same-image', 'edge-b');
  const key = getExportPreviewKey(second);
  assert.equal(getExportPreviewIndex([first, second], key), 1);
  assert.equal(getExportPreviewIndex([second, first], key), 0);
  assert.equal(getExportPreviewKey({ ...second, edge: { ...second.edge, targetPortId: 'image-1' } }), key);
});

test('disconnecting or replacing the selected image safely falls back without an out-of-range index', () => {
  const items = [item('first', 'edge-a'), item('second', 'edge-b')];
  const selected = getExportPreviewKey(items[1]);
  assert.equal(getExportPreviewIndex(items.slice(0, 1), selected, 'first'), 0);
  assert.equal(getExportPreviewIndex([item('replacement', 'edge-b')], selected), 0);
  assert.equal(getExportPreviewIndex([], selected), -1);
});
