import assert from 'node:assert/strict';
import test from 'node:test';
import { createZipBlob } from '@/shared/lib/zip-file';
import { createExportDownloadNames, sanitizeExportTitle } from './export-download-names';

const date = new Date('2026-09-10T12:34:56.789Z');
const id = '69ea781d-fab9-4eb5-84cb-f25244909c06';

test('Export ZIP and its ordered files use the node title and one download ID', () => {
  const names = createExportDownloadNames('Казбекская', date, id);
  const stem = 'Казбекская__2026-09-10_12-34-56-789Z__69ea781dfab94eb584cbf25244909c06';
  assert.equal(names.archive, `${stem}.zip`);
  assert.equal(names.image('webp', 0, 3), `${stem}__001.webp`);
  assert.equal(names.image('png', 1, 3), `${stem}__002.png`);
  assert.equal(names.image('jpg', 2, 3), `${stem}__003.jpg`);
  assert.equal(names.image('jpg', 0, 1200), `${stem}__0001.jpg`);
});

test('Same-millisecond downloads and repeated inputs do not reuse filenames', () => {
  const first = createExportDownloadNames('Казбекская', date);
  const second = createExportDownloadNames('Казбекская', date);
  assert.notEqual(first.archive, second.archive);
  assert.notEqual(first.image('png'), second.image('png'));
  assert.notEqual(first.image('png', 0, 2), first.image('png', 1, 2));
  const renamed = createExportDownloadNames('Новое имя', date, id);
  assert.ok(renamed.archive.startsWith('Новое имя__'));
});

test('Node titles retain Unicode, spaces and dots, but cannot create paths or invalid filenames', () => {
  assert.equal(sanitizeExportTitle('  Казбекская. версия 2  '), 'Казбекская. версия 2');
  assert.equal(sanitizeExportTitle('Café 東京'), 'Café 東京');
  assert.equal(sanitizeExportTitle('Cafe\u0301'), 'Café');
  assert.equal(sanitizeExportTitle('../Казбекская\\меню:*?"<>|\u0000\u202e. '), 'Казбекская-меню');
  for (const title of [undefined, '', '  ', '...///', '\u0000']) {
    assert.equal(sanitizeExportTitle(title), 'Export');
  }
  assert.throws(() => createExportDownloadNames('test', date, id).image('../png'));
});

test('Long Cyrillic and emoji titles fit byte-based filename limits without splitting codepoints', () => {
  for (const title of ['Я'.repeat(500), '🎬'.repeat(500)]) {
    const safe = sanitizeExportTitle(title);
    assert.ok(Buffer.byteLength(safe) <= 120);
    assert.ok(!safe.includes('\uFFFD'));
    const names = createExportDownloadNames(title, date, id);
    assert.ok(Buffer.byteLength(names.archive) < 255);
    assert.ok(Buffer.byteLength(names.image('webp', 999, 1000)) < 255);
  }
});

test('ZIP stores distinct title-based Unicode filenames with the UTF-8 flag', async () => {
  const names = createExportDownloadNames('Казбекская', date, id);
  const expected = [names.image('png', 0, 2), names.image('png', 1, 2)];
  const archive = Buffer.from(await (await createZipBlob(expected.map((path) => ({ path, blob: new Blob(['same image']) })))).arrayBuffer());
  const actual: string[] = [];
  let offset = archive.readUInt32LE(archive.length - 6);
  for (let i = 0; i < 2; i++) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50);
    assert.equal(archive.readUInt16LE(offset + 8) & 0x0800, 0x0800);
    const nameLength = archive.readUInt16LE(offset + 28);
    actual.push(archive.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
  }
  assert.deepEqual(actual, expected);
});
