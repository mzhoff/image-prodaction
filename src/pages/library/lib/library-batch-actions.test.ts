import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteLibraryItems, libraryActionTargets, libraryDownloadNames, prepareLibraryDownload } from './library-batch-actions';
import type { LibraryAssetItem } from '../model/types';

const items = ['photo.png', 'photo.png', '../Фото.png'].map((originalName, index) => ({ id: String(index), originalName } as LibraryAssetItem));
const signal = () => new AbortController().signal;

test('selected context targets the entire selection; unselected context targets only the clicked card', () => {
  assert.deepEqual(libraryActionTargets(items, new Set(['0', '1']), items[1]), items.slice(0, 2));
  assert.deepEqual(libraryActionTargets(items, new Set(['0', '1']), items[2]), [items[2]]);
  assert.deepEqual(libraryActionTargets(items, new Set(), items[0]), [items[0]]);
});
test('download names preserve Unicode, sanitize paths and disambiguate duplicates', () => {
  assert.deepEqual(libraryDownloadNames(items), ['photo.png', 'photo (2).png', '_Фото.png']);
  assert.deepEqual(libraryDownloadNames(['Photo.png', 'photo.png', 'photo (2).png'].map(originalName => ({ originalName } as LibraryAssetItem))), ['Photo.png', 'photo (2).png', 'photo (2) (2).png']);
});
test('single download keeps original bytes; group ZIP contains every file with unique names', async () => {
  const progress: number[] = [];
  const request: typeof fetch = async (url, init) => {
    assert.match(String(url), /^\/api\/assets\/\d\/content$/);
    assert.equal(init?.credentials, 'same-origin');
    assert.ok(init?.signal);
    return new Response('original image bytes', { headers: { 'content-type': 'image/png' } });
  };
  const single = await prepareLibraryDownload(items.slice(0, 1), signal(), () => {}, request);
  assert.equal(single.name, 'photo.png'); assert.equal(await single.blob.text(), 'original image bytes');
  const batch = await prepareLibraryDownload(items, signal(), n => progress.push(n), request);
  const data = Buffer.from(await batch.blob.arrayBuffer());
  assert.equal(data.readUInt32LE(), 0x04034b50); assert.match(batch.name, /\.zip$/);
  for (const name of libraryDownloadNames(items)) assert.ok(data.includes(Buffer.from(name)));
  assert.equal(data.readUInt16LE(data.length - 12), 3);
  assert.deepEqual(progress, [1, 2, 3]);
  await assert.rejects(prepareLibraryDownload(items, signal(), () => {}, async () => new Response(null, { status: 403 })), /Не удалось скачать/);
});
test('partial deletion reports exact successes and failures, continues, and respects cancellation', async () => {
  const deleted = await deleteLibraryItems(items, signal(), () => {}, async (url, init) => {
    assert.equal(init?.method, 'DELETE'); assert.equal(init?.credentials, 'same-origin');
    return new Response(null, { status: String(url).endsWith('/1') ? 403 : 204 });
  });
  assert.deepEqual(deleted, { deleted: ['0', '2'], failed: ['1'] });
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await deleteLibraryItems(items, controller.signal, () => {}, async () => { throw Error('must not fetch'); }), { deleted: [], failed: [] });
});
