import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedBytes } from './bounded-bytes';
import { wrapSpeechPcmAsWav } from './speech-wave';

test('bounded byte reader rejects dishonest or missing length before accumulating oversized content', async () => {
  await assert.rejects(readBoundedBytes(new Response(new Uint8Array(10)), 9), /limit/);
  await assert.rejects(readBoundedBytes(new Response('a', { headers: { 'content-length': '20' } }), 9), /limit/);
  assert.deepEqual(await readBoundedBytes(new Response(new Uint8Array([1, 2])), 2), new Uint8Array([1, 2]));
});
test('bounded reader cancels a pending body read', async () => {
  const controller = new AbortController();
  let canceled = false;
  const body = new ReadableStream({ cancel() { canceled = true; } });
  const result = readBoundedBytes(new Response(body), 10, controller.signal);
  controller.abort();
  await assert.rejects(result); assert.equal(canceled, true);
});
test('PCM wrapper records correct rate, length and rejects malformed frames', () => {
  const wav = wrapSpeechPcmAsWav(new Uint8Array(16), 24000);
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint32(24, true), 24000); assert.equal(view.getUint32(40, true), 16);
  assert.equal(wav.length, 60);
  assert.throws(() => wrapSpeechPcmAsWav(new Uint8Array(3)));
  assert.throws(() => wrapSpeechPcmAsWav(new Uint8Array(4), 999999));
});
