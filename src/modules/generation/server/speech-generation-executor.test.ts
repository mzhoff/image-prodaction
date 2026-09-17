import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { AssetDto } from '@/entities/asset/server/asset-service';
import type { AudioAssetDto } from '@/entities/asset/server/audio-asset-service';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { longSpeechOptionsSchema } from '@/modules/provider-connections/server/speech-provider-call';
import { SPEECH_CHUNKING_VERSION, splitSpeechText } from '@/shared/media/speech-text';
import { createSpeechGenerationExecutor } from './speech-generation-executor';
import { ShortAiExecutionError } from './short-ai-execution-contracts';

const options = longSpeechOptionsSchema.parse({ inputText: 'A complete sentence. '.repeat(350) });
const payload = { workspaceId: 'workspace', documentId: 'document', options };
const audio = { container: 'mp3' as const, codec: 'mp3', contentType: 'audio/mpeg' as const, durationSeconds: 60, sampleRateHz: 24000, channels: 1 };
const asset: AudioAssetDto = { id: 'asset', audio, byteSize: 20, checksumSha256: 'hash', contentType: 'audio/mpeg', createdAt: '',
  updatedAt: '', documentId: 'document', workspaceId: 'workspace', generationJobId: 'job', height: null, width: null,
  libraryVisible: false, mediaKind: 'audio', metadata: null, modelId: options.model, operation: 'generate_speech',
  origin: 'generated', originalName: 'voice.mp3', provider: 'openrouter', status: 'ready' };
const job: GenerationJobDto = { id: 'job', workspaceId: 'workspace', documentId: 'document', operation: 'generate_speech_long',
  requestObjectKey: 'payload', status: 'running', attemptCount: 1, maxAttempts: 3, provider: 'openrouter', modelId: options.model,
  metadata: { requestHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    speechChunkingVersion: SPEECH_CHUNKING_VERSION, speechChunkCount: splitSpeechText(options.inputText).length }, idempotencyKey: 'request',
  idempotentReplay: false, error: null, finalAssetId: null, createdAt: '', updatedAt: '', finishedAt: null, startedAt: new Date().toISOString(),
  leaseExpiresAt: '', usage: { complete: false, inputTokens: null, outputTokens: null, totalTokens: null, providerCostUsd: null,
    internalCreditsBalanceAfter: null, internalCreditsCharged: null } };
function fixture() {
  let calls = 0;
  const dependencies: NonNullable<Parameters<typeof createSpeechGenerationExecutor>[0]> = {
    assertActive: async () => undefined, findAsset: async () => null, getActor: async () => 'author', readPayload: async () => payload,
    generate: async (input) => {
      calls += 1; assert.equal(input.scope.metadata?.speechParentJobId, 'job');
      assert.equal(input.scope.idempotencyKey, 'speech-job:job');
      return { job: { id: 'child' }, chunkCount: 3, result: { audioBody: new Uint8Array([1]), contentType: 'audio/mpeg', generationId: null } };
    },
    inspect: async (bytes) => ({ audio, bytes, byteSize: bytes.length, contentType: 'audio/mpeg', extension: 'mp3', checksumSha256: 'hash' }),
    persist: async (input) => { assert.equal(input.generationJobId, job.id); assert.equal(input.userId, 'author'); return asset; },
  };
  return { dependencies, calls: () => calls };
}

test('durable speech executor persists final audio on the parent job without double-counting child usage', async () => {
  const setup = fixture();
  const result = await createSpeechGenerationExecutor(setup.dependencies).execute({ job, signal: new AbortController().signal });
  assert.equal(result.assetId, 'asset'); assert.equal(result.usage.providerCostUsd, null);
  assert.equal(setup.calls(), 1);
});

test('worker restart after final asset persistence reuses the asset without another provider call', async () => {
  const setup = fixture(); setup.dependencies.findAsset = async () => asset;
  const result = await createSpeechGenerationExecutor(setup.dependencies).execute({ job: { ...job, attemptCount: 2 }, signal: new AbortController().signal });
  assert.equal(result.assetId, 'asset'); assert.equal(setup.calls(), 0);
});

test('scope, immutable request checksum and existing asset type are checked before paid work', async () => {
  for (const mutate of [
    (setup: ReturnType<typeof fixture>) => { setup.dependencies.readPayload = async () => ({ ...payload, workspaceId: 'other' }); },
    (setup: ReturnType<typeof fixture>) => { setup.dependencies.readPayload = async () => ({ ...payload, options: { ...options, inputText: 'Tampered source' } }); },
    (setup: ReturnType<typeof fixture>) => { setup.dependencies.findAsset = async () => ({ ...asset, mediaKind: 'image' }) as AssetDto; },
  ]) {
    const setup = fixture(); mutate(setup);
    await assert.rejects(createSpeechGenerationExecutor(setup.dependencies).execute({ job, signal: new AbortController().signal }));
    assert.equal(setup.calls(), 0);
  }
});

test('paid ambiguous outcome is terminal for the parent worker; local output persistence may safely retry', async () => {
  const setup = fixture(); setup.dependencies.generate = async () => { throw new ShortAiExecutionError({
    classification: 'ambiguous', code: 'timeout', httpStatus: 504, message: 'Provider outcome unknown.', providerOperationId: 'paid', retryAfterMs: null,
  }); };
  await assert.rejects(createSpeechGenerationExecutor(setup.dependencies).execute({ job, signal: new AbortController().signal }), { retryable: false, code: 'timeout' });
  const local = fixture(); local.dependencies.persist = async () => { throw new Error('storage temporarily unavailable'); };
  await assert.rejects(createSpeechGenerationExecutor(local.dependencies).execute({ job, signal: new AbortController().signal }), /storage temporarily unavailable/);
});

test('a restarted job keeps its original processing deadline and cannot start new paid parts after it', async () => {
  const setup = fixture();
  await assert.rejects(createSpeechGenerationExecutor(setup.dependencies).execute({
    job: { ...job, startedAt: new Date(Date.now() - 46 * 60_000).toISOString(), attemptCount: 2 }, signal: new AbortController().signal,
  }), { code: 'speech_execution_timeout', retryable: false });
  assert.equal(setup.calls(), 0);
});

test('incompatible saved chunk plan never silently repartitions and repays old text', async () => {
  const setup = fixture();
  await assert.rejects(createSpeechGenerationExecutor(setup.dependencies).execute({
    job: { ...job, metadata: { ...job.metadata, speechChunkingVersion: 999 } }, signal: new AbortController().signal,
  }), { code: 'speech_plan_mismatch', retryable: false });
  assert.equal(setup.calls(), 0);
});
