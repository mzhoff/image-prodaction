import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { withStreamingMultipart, withStreamingUpload } from './streaming-upload';
import { readStoredMediaFile } from './stored-media-file';

function request(form: FormData, signal?: AbortSignal) { return new Request('http://localhost/upload', { method: 'POST', body: form, signal }); }
test('multipart streams across split boundaries, permits fields after the file, verifies checksum and removes private files', async () => {
  const bytes = Buffer.alloc(256 * 1024, 41), form = new FormData();
  form.set('file', new File([bytes], '../../source.mp4', { type: 'video/mp4' })); form.set('workspaceId', 'workspace');
  const original = request(form); const serialized = new Uint8Array(await original.arrayBuffer()); let offset = 0;
  const body = new ReadableStream({ pull(controller) { if (offset === serialized.length) controller.close(); else { const end = Math.min(offset + 137, serialized.length); controller.enqueue(serialized.subarray(offset, end)); offset = end; } } });
  const streaming = new Request(original.url, { method: 'POST', headers: { 'content-type': original.headers.get('content-type')! }, body, duplex: 'half' } as RequestInit);
  let path = '';
  await withStreamingUpload(streaming, bytes.length, ['file', 'workspaceId'], async ({ file, form }) => {
    path = file.path; assert.equal(form.get('workspaceId'), 'workspace'); assert.equal(file.byteLength, bytes.length);
    assert.equal(file.checksumSha256, createHash('sha256').update(bytes).digest('hex')); assert.equal(file.header.length, 4096);
    assert.deepEqual(await readFile(path), bytes); assert.equal((await stat(path)).mode & 0o777, 0o600);
  });
  await assert.rejects(stat(path), { code: 'ENOENT' });
});
test('byte cap does not trust Content-Length; duplicate fields, extra files and truncated forms never reach persistence', async () => {
  let called = 0; const work = async () => { called++; };
  const large = new FormData(); large.set('file', new File([Buffer.alloc(1025)], 'large'));
  await assert.rejects(withStreamingUpload(request(large), 1024, ['file'], work), { code: 'file_too_large' });
  const duplicate = new FormData(); duplicate.set('file', new File(['ok'], 'ok')); duplicate.append('workspaceId', 'a'); duplicate.append('workspaceId', 'b');
  await assert.rejects(withStreamingUpload(request(duplicate), 1024, ['file', 'workspaceId'], work), { code: 'invalid_multipart' });
  const extra = new FormData(); extra.append('file', new File(['a'], 'a')); extra.append('file', new File(['b'], 'b'));
  await assert.rejects(withStreamingUpload(request(extra), 1024, ['file'], work), { code: 'invalid_multipart' });
  await assert.rejects(withStreamingUpload(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body: '--test\r\n' }), 1024, ['file'], work), { code: 'invalid_multipart' });
  assert.equal(called, 0);
});
test('downstream failure is preserved and cleans up the file; abort cancels a streaming request', async () => {
  const form = new FormData(); form.set('file', new File(['hello'], 'file')); let path = '';
  await assert.rejects(withStreamingUpload(request(form), 1024, ['file'], async ({ file }) => { path = file.path; throw new Error('storage offline'); }), /storage offline/);
  await assert.rejects(stat(path), { code: 'ENOENT' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(withStreamingUpload(request(form, controller.signal), 1024, ['file'], async () => assert.fail('aborted')));
});
test('stored input is checksum verified incrementally and released explicitly', async () => {
  const bytes = Buffer.alloc(2 * 1024 * 1024, 10);
  const input = { body: new Response(bytes).body!, byteSize: bytes.length, maxBytes: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') };
  const file = await readStoredMediaFile(input); assert.equal(file.bytes.byteLength, bytes.length);
  await file.dispose(); await file.dispose(); await assert.rejects(stat(file.bytes.path), { code: 'ENOENT' });
  await assert.rejects(readStoredMediaFile({ ...input, body: new Response(bytes).body!, checksumSha256: '0'.repeat(64) }), { code: 'media_checksum_mismatch' });
});
test('multi-file uploads enforce the combined limit and still support text-only requests', async () => {
  const options = { maxBytes: 1024, fields: ['files', 'message'], fileField: 'files', maxFiles: 10 };
  const form = new FormData(); form.set('message', 'Caption');
  await withStreamingMultipart(request(form), options, async ({ files, form }) => { assert.equal(files.length, 0); assert.equal(form.get('message'), 'Caption'); });
  form.append('files', new File([Buffer.alloc(512)], 'a')); form.append('files', new File([Buffer.alloc(512)], 'b'));
  let paths: string[] = [];
  await withStreamingMultipart(request(form), options, async ({ files }) => { paths = files.map((file) => file.path); assert.deepEqual(files.map((file) => file.name), ['a', 'b']); });
  for (const path of paths) await assert.rejects(stat(path), { code: 'ENOENT' });
  form.append('files', new File(['overflow'], 'c'));
  await assert.rejects(withStreamingMultipart(request(form), options, async () => assert.fail('Must reject aggregate overflow')), { code: 'file_too_large' });
});
