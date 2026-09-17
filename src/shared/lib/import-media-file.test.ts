import assert from 'node:assert/strict';
import test from 'node:test';
import { getImportMediaFiles, getImportMediaKind, hasImportMediaFile } from './import-media-file';

function transfer(input: { items?: Array<{ kind: string; type: string; getAsFile(): File | null }>; files?: File[] }): DataTransfer {
  return { items: input.items ?? [], files: input.files ?? [] } as unknown as DataTransfer;
}
function item(file: File) { return { kind: 'file', type: file.type, getAsFile: () => file }; }

test('video/audio/image names classify case-insensitively even with missing or generic MIME', () => {
  for (const extension of ['mp4', 'MOV', 'WebM']) assert.equal(getImportMediaKind(new File(['x'], `clip.${extension}`)), 'video');
  for (const extension of ['MP3', 'wav', 'FLAC', 'ogg', 'OPUS', 'm4a', 'aac']) assert.equal(getImportMediaKind(new File(['x'], `recording.${extension}`, { type: 'application/octet-stream' })), 'audio');
  for (const extension of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'HEIC', 'heif']) assert.equal(getImportMediaKind(new File(['x'], `picture.${extension}`)), 'image');
  assert.equal(getImportMediaKind(new File(['x'], 'notes.pdf', { type: 'application/pdf' })), undefined);
  assert.equal(getImportMediaKind(new File(['x'], 'readme.txt', { type: 'text/plain' })), undefined);
  assert.equal(getImportMediaKind(new File(['x'], 'clip.mp4.exe', { type: 'application/octet-stream' })), undefined);
});
test('MIME routes unnamed media, and classification does not claim server codec validation', () => {
  assert.equal(getImportMediaKind(new File(['x'], 'unnamed', { type: 'video/mp4' })), 'video');
  assert.equal(getImportMediaKind(new File(['x'], 'unnamed', { type: 'audio/ogg' })), 'audio');
  assert.equal(getImportMediaKind(new File(['x'], 'unnamed', { type: 'image/png' })), 'image');
  assert.equal(getImportMediaKind(new File(['not really video'], 'clip.mp4', { type: 'image/png' })), 'video', 'Server still validates the signature and MIME mismatch.');
  assert.equal(getImportMediaKind(new File(['x'], 'unsupported.mkv', { type: 'video/x-matroska' })), 'video', 'Family routing is not a promise of supported video containers.');
});
test('drag preflight accepts media families and unknown file MIME, not links or known documents', () => {
  assert.equal(hasImportMediaFile(null), false);
  assert.equal(hasImportMediaFile(transfer({})), false);
  assert.equal(hasImportMediaFile(transfer({ items: [{ kind: 'string', type: 'text/uri-list', getAsFile: () => null }] })), false);
  assert.equal(hasImportMediaFile(transfer({ items: [item(new File(['x'], 'doc.pdf', { type: 'application/pdf' }))] })), false);
  for (const type of ['video/quicktime', 'audio/aac', 'image/jpeg', '']) {
    assert.equal(hasImportMediaFile(transfer({ items: [{ kind: 'file', type, getAsFile: () => null }] })), true);
  }
});
test('drop returns recognized item files, skips null/directory/string/document items and does not duplicate fallback files', () => {
  const movie = new File(['x'], 'clip.mov'); const voice = new File(['x'], 'recording.m4a'); const photo = new File(['x'], 'photo.png');
  const files = getImportMediaFiles(transfer({ items: [item(movie), { kind: 'string', type: 'text/plain', getAsFile: () => photo },
    { kind: 'file', type: '', getAsFile: () => null }, item(new File(['x'], 'notes.pdf')), item(voice)], files: [movie, voice, photo] }));
  assert.deepEqual(files, [movie, voice]); assert.equal(files[0], movie); assert.equal(files[1], voice);
  assert.deepEqual(getImportMediaFiles(null), []);
});
test('drop and preflight fall back to files when items are unavailable or contain no usable media', () => {
  const movie = new File(['x'], 'clip.WEBM', { type: 'application/octet-stream' }); const pdf = new File(['x'], 'notes.pdf');
  const missingItems = transfer({ files: [pdf, movie] });
  assert.equal(hasImportMediaFile(missingItems), true); assert.deepEqual(getImportMediaFiles(missingItems), [movie]);
  const unusableItems = transfer({ items: [{ kind: 'file', type: '', getAsFile: () => null }, item(pdf)], files: [movie, pdf] });
  assert.deepEqual(getImportMediaFiles(unusableItems), [movie]);
});
