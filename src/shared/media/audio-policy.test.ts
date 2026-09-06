import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioProcessingError, MAX_AUDIO_BYTES, MAX_AUDIO_OUTPUT_BYTES, audioConvertOptionsSchema } from './audio-contracts';
import { audioInputArguments, detectAudioContainer, validateAudioEnvelope } from './audio-inspection';
import { readAudioMultipart, readBoundedAudioStream, withAudioUploadLimit } from './audio-upload-request';
import { parseAssetByteRange, AssetRangeError } from '../storage/byte-range';

function header(value: string, size = 20) { const bytes = Buffer.alloc(size); bytes.write(value); return bytes; }
test('audio signatures are independent of names and declared MIME', () => {
  assert.equal(detectAudioContainer(header('OggS')), 'ogg');
  assert.equal(detectAudioContainer(header('fLaC')), 'flac');
  assert.equal(detectAudioContainer(header('ID3')), 'mp3');
  const wav = header('RIFF'); wav.write('WAVE', 8);
  assert.equal(detectAudioContainer(wav), 'wav');
  const m4a = header(''); m4a.write('ftyp', 4);
  assert.equal(detectAudioContainer(m4a), 'm4a');
  assert.throws(() => detectAudioContainer(header('#EXTM3U')), { code: 'unsupported_audio' });
  assert.throws(() => validateAudioEnvelope(wav, { claimedContentType: 'image/png' }), { code: 'content_type_mismatch' });
  assert.equal(validateAudioEnvelope(wav, { claimedContentType: 'audio/x-wav' }), 'wav');
  assert.equal(validateAudioEnvelope(wav, { claimedContentType: 'application/octet-stream' }), 'wav');
  assert.throws(() => validateAudioEnvelope(wav, { maxBytes: 1 }), { code: 'file_too_large' });
});
test('external byte cap stays 50 MiB; only explicit internal callers may inspect 128 MiB', () => {
  const large = header('OggS', MAX_AUDIO_BYTES + 1);
  assert.throws(() => validateAudioEnvelope(large, {}), { code: 'file_too_large' });
  assert.equal(validateAudioEnvelope(large, { maxBytes: MAX_AUDIO_OUTPUT_BYTES }), 'ogg');
  assert.equal(audioConvertOptionsSchema.safeParse({ format: 'mp3', extraArgs: '-protocol_whitelist http' }).success, false);
  assert.equal(audioConvertOptionsSchema.safeParse({ format: 'ogg', sampleRateHz: 44100 }).success, false);
  assert.equal(audioConvertOptionsSchema.safeParse({ format: 'ogg', sampleRateHz: 48000 }).success, true);
  const args = audioInputArguments('m4a', '/private/owned/source');
  assert.equal(args[args.indexOf('-enable_drefs') + 1], '0');
  assert.equal(args[args.indexOf('-use_absolute_path') + 1], '0');
  assert.equal(args[args.indexOf('-protocol_whitelist') + 1], 'file,pipe');
});
test('stream bound is enforced without trusting Content-Length', async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(11)); }, cancel() { canceled = true; } });
  await assert.rejects(readBoundedAudioStream(body, 10), { code: 'file_too_large' });
  assert.equal(canceled, true);
});
test('multipart rejects caller scope on runtime endpoint and duplicate fields', async () => {
  const form = new FormData(); form.set('file', new File([header('OggS')], 'voice.ogg', { type: 'audio/ogg' })); form.set('workspaceId', 'outsider');
  await assert.rejects(readAudioMultipart(new Request('http://local', { method: 'POST', body: form }), ['file']), { code: 'invalid_upload_field' });
  form.delete('workspaceId'); form.append('file', new File([header('OggS')], 'voice2.ogg'));
  await assert.rejects(readAudioMultipart(new Request('http://local', { method: 'POST', body: form }), ['file']), { code: 'invalid_upload_field' });
  form.delete('file'); form.set('file', new File([header('OggS')], 'voice.ogg', { type: 'audio/ogg' }));
  const uploaded = await readAudioMultipart(new Request('http://local', { method: 'POST', body: form }), ['file']);
  assert.equal(uploaded.file.size, 20);
});
test('upload concurrency bounds body memory and releases slots after errors', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const first = withAudioUploadLimit(() => blocked); const second = withAudioUploadLimit(() => blocked);
  await assert.rejects(withAudioUploadLimit(async () => 3), { code: 'audio_upload_busy' });
  release(); await Promise.all([first, second]);
  await assert.rejects(withAudioUploadLimit(async () => { throw new Error('stop'); }));
  assert.equal(await withAudioUploadLimit(async () => 4), 4);
});
test('authenticated media ranges support seek and reject multiple/invalid ranges', () => {
  assert.deepEqual(parseAssetByteRange('bytes=5-8', 10), { start: 5, end: 8, total: 10 });
  assert.deepEqual(parseAssetByteRange('bytes=5-', 10), { start: 5, end: 9, total: 10 });
  assert.deepEqual(parseAssetByteRange('bytes=-3', 10), { start: 7, end: 9, total: 10 });
  assert.deepEqual(parseAssetByteRange('bytes=0-100', 10), { start: 0, end: 9, total: 10 });
  for (const range of ['bytes=0-1,3-4', 'bytes=10-', 'bytes=-0', 'bytes=9-2', 'bytes=--', 'bytes=9007199254740999-']) assert.throws(() => parseAssetByteRange(range, 10), AssetRangeError);
  assert.equal(new AudioProcessingError('x', 'safe').status, 422);
});
