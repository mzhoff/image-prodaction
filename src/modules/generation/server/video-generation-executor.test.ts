import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { videoRequestSchema } from '@/shared/media/video-generation-contracts';
import type { VideoAssetDto } from '@/entities/asset/server/video-asset-service';
import { createVideoGenerationExecutor } from './video-generation-executor';
import { normalizeVideoProviderDiagnostic, VideoProviderError } from '@/modules/provider-connections/core/video-provider-error';

type Dependencies = NonNullable<Parameters<typeof createVideoGenerationExecutor>[0]>;
type RecordValue = Awaited<ReturnType<NonNullable<Dependencies['readRecord']>>>;
const request = videoRequestSchema.parse({ model: 'google/veo-3.1-lite', mode: 'text', prompt: 'Move slowly', duration: 4, resolution: '720p', aspectRatio: '16:9' });
const payload = { workspaceId: 'workspace', documentId: 'document', request };
const usage = { providerCostUsd: '0.15', complete: true, inputTokens: null, outputTokens: null, totalTokens: null,
  cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null };
const video = { container: 'mp4' as const, codec: 'h264' as const, contentType: 'video/mp4' as const, durationSeconds: 4,
  width: 1280, height: 720, frameRate: 24, rotationDegrees: 0, audioTracks: [], browserPlayable: true };
const asset = { id: 'asset', workspaceId: 'workspace', documentId: 'document', status: 'ready', mediaKind: 'video', video } as unknown as VideoAssetDto;
const job = { id: 'job', workspaceId: 'workspace', documentId: 'document', operation: 'generate_video', provider: 'openrouter', modelId: request.model,
  requestObjectKey: 'payload', attemptCount: 1, maxAttempts: 3, status: 'running' } as GenerationJobDto;
function fixture() {
  const events: string[] = [];
  const record = { ...job, createdByUserId: 'author', providerOperationId: null, providerDispatchedAt: null,
    providerDispatchedAttempt: null, metadata: { requestHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex') },
    providerCostUsd: null, inputTokens: null, outputTokens: null, totalTokens: null } as unknown as RecordValue;
  const deps: Dependencies = {
    readRecord: async () => record, active: async () => undefined, findAsset: async () => null,
    readPayload: async () => structuredClone(payload),
    credential: async () => ({ apiKey: 'fake', connection: { id: 'connection' } } as Awaited<ReturnType<NonNullable<Dependencies['credential']>>>),
    catalog: async () => [{ key: request.model, label: 'Veo', description: '', route: { gateway: 'openrouter', modelId: request.model },
      durations: [4, 6, 8], resolutions: ['720p'], aspectRatios: ['16:9'], firstFrame: true, lastFrame: true, references: false, audio: true, seed: true }],
    prepare: async () => ({ ...request, firstFrame: undefined, lastFrame: undefined, references: [] }),
    dispatch: async () => { events.push('dispatch'); record.providerDispatchedAt = new Date(); record.providerDispatchedAttempt = 1; },
    saveOperation: async ({ providerOperationId }) => { events.push('checkpoint'); record.providerOperationId = providerOperationId; },
    markUsed: async () => undefined, recordUsage: async () => { events.push('usage'); },
    diagnostic: async () => { events.push('diagnostic'); },
    adapter: {
      submit: async () => { events.push('submit'); return { operationId: 'paid-1', status: 'pending', usage }; },
      poll: async (id) => { assert.equal(id, 'paid-1'); events.push('poll'); return { operationId: id, status: 'completed', usage }; },
      download: async (id) => { assert.equal(id, 'paid-1'); events.push('download'); return new Uint8Array([1]); },
    },
    inspect: async (bytes) => ({ video, bytes, byteSize: bytes.byteLength, checksumSha256: 'hash', extension: 'mp4', contentType: 'video/mp4' }),
    persist: async (input) => { assert.equal(input.generationJobId, 'job'); assert.equal(input.workspaceId, 'workspace'); events.push('persist'); return asset; },
    wait: async () => undefined,
  };
  return { deps, events, record, run: () => createVideoGenerationExecutor(deps).execute({ job, signal: new AbortController().signal }) };
}
test('video dispatch checkpoints provider ID before polling and records cost before persistence', async () => {
  const f = fixture(); const result = await f.run();
  assert.equal(result.assetId, 'asset'); assert.equal(result.usage.providerCostUsd, '0.15');
  assert.deepEqual(f.events, ['dispatch', 'submit', 'checkpoint', 'poll', 'usage', 'download', 'persist']);
});
test('confirmed content rejection preserves its cause and never polls or automatically resubmits', async () => {
  const f = fixture();
  const diagnostic = normalizeVideoProviderDiagnostic({ httpStatus: 400,
    body: { error: { code: 'InputImageSensitiveContentDetected.PrivacyInformation', message: 'The input image may contain real person.' } } });
  f.deps.adapter!.submit = async () => { f.events.push('submit'); throw new VideoProviderError(diagnostic); };
  await assert.rejects(f.run(), { code: 'video_input_person_restricted', message: diagnostic.message, retryable: false });
  assert.deepEqual(f.events, ['dispatch', 'submit', 'diagnostic']);
});
test('terminal polling failure keeps provider reason and records any reported charge', async () => {
  const f = fixture();
  const diagnostic = normalizeVideoProviderDiagnostic({ httpStatus: null, body: { code: 'ContentPolicyViolation', message: 'Content policy violation' } });
  f.deps.adapter!.poll = async (operationId) => ({ operationId, status: 'failed', usage, failure: diagnostic });
  await assert.rejects(f.run(), { code: 'video_content_rejected', message: diagnostic.message, retryable: false });
  assert.ok(f.events.indexOf('usage') < f.events.indexOf('diagnostic'));
  assert.ok(!f.events.includes('download'));
});
test('HTTP 500 on submit remains uncertain while a polling 429 recovers the existing ID', async () => {
  const f = fixture();
  f.deps.adapter!.submit = async () => { throw new VideoProviderError(normalizeVideoProviderDiagnostic({ httpStatus: 500, body: {} })); };
  await assert.rejects(f.run(), { code: 'video_submit_unconfirmed', retryable: false });
  const polled = fixture();
  polled.deps.adapter!.poll = async () => { throw new VideoProviderError(normalizeVideoProviderDiagnostic({ httpStatus: 429, body: {} })); };
  await assert.rejects(polled.run(), { code: 'video_recovery_required', retryable: true });
  assert.equal(polled.record.providerOperationId, 'paid-1');
});
test('worker recovery resumes one provider job without new paid submission', async () => {
  const f = fixture(); f.record.providerOperationId = 'paid-1'; f.record.providerDispatchedAt = new Date();
  await f.run(); assert.equal(f.events.includes('submit'), false); assert.equal(f.events[0], 'poll');
});
test('persisted asset recovery repairs cost without downloading or regenerating', async () => {
  const f = fixture(); f.record.providerOperationId = 'paid-1'; f.deps.findAsset = async () => asset;
  const result = await f.run(); assert.equal(result.usage.providerCostUsd, '0.15');
  assert.deepEqual(f.events, ['poll', 'usage']);
});
test('unknown dispatch, checksum mismatch and foreign assets block all paid work', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.record.providerDispatchedAt = new Date(); },
    (f: ReturnType<typeof fixture>) => { f.deps.readPayload = async () => ({ ...payload, workspaceId: 'other' }); },
    (f: ReturnType<typeof fixture>) => { f.deps.findAsset = async () => ({ ...asset, workspaceId: 'other' }); },
  ]) { const f = fixture(); mutate(f); await assert.rejects(f.run(), { retryable: false }); assert.equal(f.events.includes('submit'), false); }
});
test('lost submission response is not blindly retried; output persistence failure is recoverable', async () => {
  const f = fixture(); f.deps.adapter!.submit = async () => { throw new Error('network timeout'); };
  await assert.rejects(f.run(), { code: 'video_submit_unconfirmed', retryable: false });
  const saved = fixture(); saved.deps.persist = async () => { throw new Error('storage down'); };
  await assert.rejects(saved.run(), { code: 'video_recovery_required', retryable: true });
  assert.equal(saved.record.providerOperationId, 'paid-1');
});
test('provider failure cost is recorded; retries cannot reset the 45-minute deadline', async () => {
  const f = fixture(); f.deps.adapter!.poll = async (operationId) => ({ operationId, status: 'failed', usage });
  await assert.rejects(f.run(), { code: 'video_failed', retryable: false }); assert.ok(f.events.includes('usage'));
  const expired = fixture(); expired.record.providerOperationId = 'paid-1'; expired.record.providerDispatchedAt = new Date(Date.now() - 46 * 60_000);
  await assert.rejects(expired.run(), { code: 'video_wait_timeout', retryable: false }); assert.deepEqual(expired.events, []);
});
test('semantic model key can differ from gateway route ID; changed routes fail before dispatch', async () => {
  const f = fixture(), routeId = 'gateway/model-alias';
  f.record.metadata = { ...f.record.metadata, modelKey: request.model };
  const catalog = await f.deps.catalog!(); f.deps.catalog = async () => [{ ...catalog[0], route: { gateway: 'openrouter', modelId: routeId } }];
  f.deps.adapter!.submit = async (input) => {
    assert.equal(input.model, routeId); return { operationId: 'paid-1', status: 'pending', usage };
  };
  await createVideoGenerationExecutor(f.deps).execute({ job: { ...job, modelId: routeId }, signal: new AbortController().signal });
  const changed = fixture(); changed.deps.catalog = f.deps.catalog;
  await assert.rejects(changed.run(), { code: 'video_route_changed', retryable: false });
  assert.deepEqual(changed.events, []);
});

test('Home video uses the same checkpointed executor and persists conversation attribution without a document', async () => {
  const f = fixture();
  const homePayload = { ...payload, documentId: null, homeConversationId: 'home:test' };
  f.record.documentId = null;
  f.record.metadata = { requestHash: createHash('sha256').update(JSON.stringify(homePayload)).digest('hex') };
  f.deps.readPayload = async () => homePayload;
  f.deps.persist = async (input) => {
    assert.equal(input.documentId, null); assert.equal(input.libraryVisible, true);
    assert.equal(input.metadata?.homeConversationId, 'home:test'); assert.equal(input.metadata?.source, 'home-chat');
    return { ...asset, documentId: null };
  };
  await createVideoGenerationExecutor(f.deps).execute({ job: { ...job, documentId: null }, signal: new AbortController().signal });
  assert.equal(f.events.filter((event) => event === 'submit').length, 1);
});
