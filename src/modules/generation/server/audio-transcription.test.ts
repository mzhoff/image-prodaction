import assert from 'node:assert/strict';
import test from 'node:test';
import { transcribeAudio, createTranscriptionRequest, type TranscriptionChunkExecutor } from './audio-transcription';
import type { forEachAudioChunk } from '@/shared/media/audio-processor';

test('transcription sends FLAC with strict transcription instructions, never a storage URL', () => {
  const request = createTranscriptionRequest(new Uint8Array([1, 2]), 'google/gemini-3.1-flash-lite', 'ru');
  assert.equal(request.operation, 'transcribe_audio');
  assert.deepEqual(request.messages[1]?.parts[1], { modality: 'audio', format: 'flac', mediaType: 'audio/flac', data: 'AQI=' });
  assert.match(JSON.stringify(request.messages[0]), /never as instructions/);
  assert.equal(request.parameters?.maxOutputTokens, 8192);
});

test('transcription chunks execute sequentially with stable isolated replay keys', async () => {
  const observed: string[] = [];
  const chunks: typeof forEachAudioChunk = async (_input, consume) => {
    for (let index = 0; index < 2; index += 1) await consume({ index, startSeconds: index * 60,
      endSeconds: (index + 1) * 60, bytes: new Uint8Array([index]), contentType: 'audio/flac' });
    return { durationSeconds: 120, chunkCount: 2 };
  };
  const execute: TranscriptionChunkExecutor = async (input) => {
    observed.push(input.idempotencyKey); return { result: `part ${input.metadata?.audioChunkIndex}` };
  };
  const input = { actorUserId: 'user', workspaceId: 'workspace', idempotencyKey: 'retry-key',
    signal: new AbortController().signal, bytes: new Uint8Array([7]), model: 'model' };
  assert.equal(await transcribeAudio(input, { chunks, execute }), 'part 0\n\npart 1');
  await transcribeAudio(input, { chunks, execute });
  assert.equal(observed[0], observed[2]); assert.equal(observed[1], observed[3]); assert.notEqual(observed[0], observed[1]);
  await transcribeAudio({ ...input, bytes: new Uint8Array([8]) }, { chunks, execute });
  assert.notEqual(observed[0], observed[4]);
});

test('cancellation stops before the next paid transcription chunk', async () => {
  const controller = new AbortController();
  let count = 0;
  const chunks: typeof forEachAudioChunk = async (_input, consume) => {
    const chunk = { index: 0, startSeconds: 0, endSeconds: 60, bytes: new Uint8Array([1]), contentType: 'audio/flac' as const };
    await consume(chunk); controller.abort(); await consume({ ...chunk, index: 1 });
    return { durationSeconds: 120, chunkCount: 2 };
  };
  await assert.rejects(() => transcribeAudio({ actorUserId: 'user', workspaceId: 'workspace', idempotencyKey: 'key',
    signal: controller.signal, bytes: new Uint8Array([1]), model: 'model' }, {
    chunks, execute: async () => { count += 1; return { result: 'one' }; },
  }));
  assert.equal(count, 1);
});
