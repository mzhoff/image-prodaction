import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSpeech, type SpeechChunkExecutor } from './speech-generation';
import { longSpeechOptionsSchema } from '@/modules/provider-connections/server/speech-provider-call';
import type { assembleSpeechParts } from '@/shared/media/speech-assembly';
import { ShortAiExecutionError } from './short-ai-execution-contracts';

const input = { actorUserId: 'author', options: longSpeechOptionsSchema.parse({ inputText: 'First sentence. Second sentence.\n\n'.repeat(300) }),
  scope: { workspaceId: 'workspace', documentId: 'document', idempotencyKey: 'logical-request', metadata: { speechParentJobId: 'parent' } }, signal: new AbortController().signal };
const assemble: typeof assembleSpeechParts = async ({ parts }) => {
  const bytes: number[] = [];
  for await (const part of parts) bytes.push(...part);
  return { bytes: new Uint8Array(bytes), byteSize: bytes.length, checksumSha256: 'checksum', contentType: 'audio/mpeg', extension: 'mp3',
    audio: { container: 'mp3', codec: 'mp3', contentType: 'audio/mpeg', durationSeconds: 1, sampleRateHz: 24_000, channels: 1 } };
};

test('long speech preserves order, settings, per-part usage attribution and stable replay keys', async () => {
  const calls: Parameters<SpeechChunkExecutor>[0][] = [];
  const execute: SpeechChunkExecutor = async (call) => {
    calls.push(call);
    const index = Number(call.scope.metadata?.speechChunkIndex);
    return { job: { id: `part-${index}` }, result: { audioBody: new Uint8Array([index]), contentType: 'audio/wav', generationId: 'provider-id' } };
  };
  const result = await generateSpeech(input, { execute, assemble });
  assert.equal(result.result.contentType, 'audio/mpeg'); assert.equal(result.result.generationId, null);
  assert.deepEqual([...result.result.audioBody], calls.map((_, index) => index));
  const keys = calls.map((call) => call.scope.idempotencyKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(calls.every((call) => call.modelId === input.options.model && call.scope.metadata?.speechParentJobId === 'parent'));
  calls.length = 0;
  await generateSpeech(input, { execute, assemble });
  assert.deepEqual(calls.map((call) => call.scope.idempotencyKey), keys);
  calls.length = 0;
  await generateSpeech({ ...input, options: { ...input.options, voice: 'Puck' } }, { execute, assemble });
  assert.notEqual(calls[0]?.scope.idempotencyKey, keys[0]);
});

test('retry after local assembly failure reuses completed paid chunks', async () => {
  const saved = new Map<string, Awaited<ReturnType<SpeechChunkExecutor>>>();
  let dispatched = 0;
  const execute: SpeechChunkExecutor = async (call) => {
    const key = call.scope.idempotencyKey!;
    if (saved.has(key)) return saved.get(key)!;
    dispatched += 1;
    const result = { job: { id: key }, result: { audioBody: new Uint8Array([dispatched]), contentType: 'audio/wav', generationId: null } };
    saved.set(key, result); return result;
  };
  await assert.rejects(generateSpeech(input, { execute, assemble: async (parts) => { await assemble(parts); throw new Error('temporary assembly failure'); } }), /assembly failure/);
  const count = dispatched;
  await generateSpeech(input, { execute, assemble });
  assert.equal(dispatched, count);
});

test('an ambiguous dispatched part stops the whole generation without automatic paid retry', async () => {
  let count = 0;
  const error = new ShortAiExecutionError({ classification: 'ambiguous', code: 'timeout', httpStatus: 504,
    message: 'Reconcile before retry.', providerOperationId: 'paid-id', retryAfterMs: null });
  await assert.rejects(generateSpeech(input, { assemble, execute: async () => { count += 1; throw error; } }), (caught) => caught === error);
  assert.equal(count, 1);
});

test('cancellation and lease loss prevent the next paid chunk', async () => {
  let count = 0;
  await assert.rejects(generateSpeech({ ...input, assertActive: async () => { if (count) throw new Error('lease lost'); } }, {
    assemble, execute: async () => { count += 1; return { job: { id: 'part' }, result: { audioBody: new Uint8Array([1]), contentType: 'audio/wav', generationId: null } }; },
  }), /lease lost/);
  assert.equal(count, 1);
});

test('short speech retains its format and does not invoke assembly', async () => {
  const result = await generateSpeech({ ...input, options: { ...input.options, inputText: 'A short sentence.' } }, {
    assemble: async () => { throw new Error('must not assemble'); },
    execute: async (call) => { assert.equal(call.scope.idempotencyKey, input.scope.idempotencyKey);
      return { job: { id: 'short' }, result: { audioBody: new Uint8Array([1]), contentType: 'audio/wav', generationId: 'one' } }; },
  });
  assert.equal(result.result.contentType, 'audio/wav'); assert.equal(result.chunkCount, 1);
});
