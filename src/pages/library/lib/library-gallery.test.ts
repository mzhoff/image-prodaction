import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLibraryByteSize, formatLibraryTimestamp, groupLibraryAssets, layoutLibraryRows, libraryAspectRatio } from './library-gallery';
import type { LibraryAssetItem } from '../model/types';

const item = (id: string, width = 1600, height = 900, createdAt = '2026-09-08T10:12:40Z'): LibraryAssetItem => ({
  id, width, height, createdAt, byteSize: 3_145_728, workspaceId: 'workspace', document: null, originalName: `technical-${id}.png`,
  contentType: 'image/png', mediaKind: 'image', origin: 'generated', provider: null, modelId: null, operation: null, contentUrl: `/assets/${id}`,
});

test('gallery rows preserve proportions and input order across screen sizes without overflow', () => {
  const items = Array.from({ length: 200 }, (_, i) => item(String(i), i % 3 ? 900 : 1600, i % 3 ? 1600 : 900));
  for (const width of [280, 375, 768, 1200, 2200]) {
    const rows = layoutLibraryRows(items, width, 245);
    assert.deepEqual(rows.flatMap((row) => row.items.map((entry) => entry.id)), items.map((entry) => entry.id));
    for (const row of rows) {
      assert.ok(row.height > 0 && row.height <= 245);
      assert.ok(row.widths.reduce((a, b) => a + b, 0) + (row.items.length - 1) * 10 <= width + 0.001);
      row.widths.forEach((w, index) => assert.ok(Math.abs(w / row.height - libraryAspectRatio(row.items[index]!)) < 0.00001));
    }
  }
  assert.equal(layoutLibraryRows([item('portrait', 900, 1600)], 2000, 245)[0]!.height, 245);
  assert.deepEqual(layoutLibraryRows(items, 0, 245), []);
  assert.equal(libraryAspectRatio({ width: null, height: null }), 1);
  assert.equal(libraryAspectRatio({ width: -1, height: 0 }), 1);
});

test('minute groups merge a paginated batch, preserve order and do not mix dates or offsets', () => {
  const a = item('a', 10, 10, '2026-09-08T10:12:40Z');
  const b = item('b', 10, 10, '2026-09-08T13:12:02+03:00');
  const c = item('c', 10, 10, '2026-09-07T10:12:59Z');
  const groups = groupLibraryAssets([a, b, c], 'dates');
  assert.deepEqual(groups.map((group) => group.items.map((asset) => asset.id)), [['a', 'b'], ['c']]);
  assert.equal(groupLibraryAssets([a, b, c], 'gallery').length, 1);
  const missing = groupLibraryAssets([item('bad', 10, 10, 'broken')], 'dates');
  assert.equal(formatLibraryTimestamp(missing[0]!.createdAt), 'Без даты');
});

test('original byte size is formatted without inventing a zero for missing data', () => {
  assert.equal(formatLibraryByteSize(3_145_728), '3 МБ');
  assert.equal(formatLibraryByteSize(0), '0 Б');
  assert.equal(formatLibraryByteSize(1024), '1 КБ');
  for (const missing of [null, undefined, NaN, -1]) assert.equal(formatLibraryByteSize(missing), 'Размер неизвестен');
});
