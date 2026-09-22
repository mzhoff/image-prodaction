import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TIMELINE_MODEL } from '@/shared/api/timeline-models';
import { randomUUID } from 'node:crypto';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { AudioProcessingError } from '@/shared/media/audio-contracts';
import { StoryError } from '@/modules/story-projects/server/story-service';
import { emptyTimeline } from '@/modules/story-projects/contracts/story-timeline';
import { isUuidV7 } from '@/shared/lib/id';
import { createMontageExecutor } from './montage-executor';
import { montageHash, type MontagePayload, type MontageResult } from './montage-contracts';
import { ShortAiExecutionError } from './short-ai-execution-contracts';

const workspaceId = randomUUID(), timelineId = randomUUID(), videoId = randomUUID(), musicId = randomUUID();
const payload: MontagePayload = { version: 1, userId: 'author', workspaceId, timelineId, name: 'Promo', revision: 2,
  snapshot: { ...emptyTimeline(), production: { purpose: 'promo', brief: 'Dive', pacing: 'mixed', targetDurationMs: 5000, sourceAssetIds: [videoId] } },
  request: { action: 'analyze', model: DEFAULT_TIMELINE_MODEL, expectedRevision: 2, idempotencyKey: 'test', musicAssetId: musicId, musicSourceInMs: 0, beatOffsetMs: 0 },
  checksums: { [videoId]: 'a'.repeat(64), [musicId]: 'b'.repeat(64) } };
const result: Extract<MontageResult, { kind: 'analysis' }> = { kind: 'analysis', analysis: { version: 1, complete: true, completedAssetIds: [videoId],
  sources: [{ id: 'shot', assetId: videoId, checksum: payload.checksums[videoId], startMs: 0, endMs: 5000, description: 'Diving' }],
  music: { version: 1, assetId: musicId, checksum: payload.checksums[musicId], durationMs: 5000, sourceInMs: 0, bpm: 120, confidence: 1, method: 'manual', beatsMs: [0, 500], energy: [] } } };
const job: GenerationJobDto = { id: randomUUID(), workspaceId, documentId: null, operation: 'montage_analyze', requestObjectKey: 'payload',
  status: 'running', attemptCount: 1, maxAttempts: 2, provider: 'openrouter', modelId: DEFAULT_TIMELINE_MODEL,
  metadata: { requestHash: montageHash(payload), timelineId }, idempotencyKey: 'test', idempotentReplay: false, error: null, finalAssetId: null,
  createdAt: '', updatedAt: '', finishedAt: null, startedAt: new Date().toISOString(), leaseExpiresAt: '',
  usage: { complete: false, inputTokens: null, outputTokens: null, totalTokens: null, providerCostUsd: null, internalCreditsBalanceAfter: null, internalCreditsCharged: null } };
type Deps = NonNullable<Parameters<typeof createMontageExecutor>[0]>;
function setup() {
  const saved: unknown[] = []; let calls = 0, access = 0;
  const record = { createdByUserId: 'author', resultObjectKey: null } as Awaited<ReturnType<NonNullable<Deps['getRecord']>>>;
  const deps: Deps = {
    getRecord: async () => record, assertActive: async (_id, _attempt, signal) => { signal.throwIfAborted(); }, readPayload: async () => structuredClone(payload),
    getTimeline: async () => { access++; return { id: timelineId, workspaceId, snapshot: payload.snapshot, name: 'Changed manually', revision: 5, folderId: null, storyboardId: null, createdAt: '', updatedAt: '' }; },
    readResult: async () => structuredClone(result), saveResult: async (value) => { saved.push(value); },
    analyze: async (input) => { calls++; await input.assertActive(); await input.checkpoint(result.analysis); return result.analysis; },
  };
  return { deps, record, saved, calls: () => calls, access: () => access };
}
const execute = (fixture: ReturnType<typeof setup>, change: Partial<GenerationJobDto> = {}) => createMontageExecutor(fixture.deps).execute({ job: { ...job, ...change }, signal: AbortSignal.timeout(5000) });
test('durable montage rechecks membership, stores a proposal separately from edited document and reuses checkpoint', async () => {
  const f = setup(), value = await execute(f);
  assert.equal(f.calls(), 1); assert.ok(f.access() >= 3); assert.equal(f.saved.length, 1); assert.equal(value.usage.providerCostUsd, null);
  f.record.resultObjectKey = 'result'; await execute(f, { attemptCount: 2 }); assert.equal(f.calls(), 1);
});
test('scope, ownership, membership and expired time prevent dispatch', async () => {
  for (const change of [
    (f: ReturnType<typeof setup>) => { f.deps.readPayload = async () => ({ ...payload, userId: 'attacker' }); },
    (f: ReturnType<typeof setup>) => { f.record.createdByUserId = 'another'; },
    (f: ReturnType<typeof setup>) => { f.deps.getTimeline = async () => { throw new StoryError('Access revoked', 404, 'timeline_not_found'); }; },
  ]) { const f = setup(); change(f); await assert.rejects(execute(f)); assert.equal(f.calls(), 0); }
  const f = setup(); await assert.rejects(execute(f, { startedAt: new Date(Date.now() - 21 * 60000).toISOString() }), { code: 'montage_timeout' }); assert.equal(f.calls(), 0);
});
test('invalid model data and uncertain paid outcomes are terminal; busy native processing can retry', async () => {
  const uncertain = new ShortAiExecutionError({ classification: 'ambiguous', code: 'timeout', httpStatus: 504, message: 'Unknown paid outcome', providerOperationId: 'paid', retryAfterMs: null });
  for (const [error, retryable] of [[new Error('Invalid ranges'), false], [uncertain, false], [new AudioProcessingError('audio_busy', 'Busy', 503), true]] as const) {
    const f = setup(); f.deps.analyze = async () => { throw error; };
    await assert.rejects(execute(f), { retryable }); assert.equal(f.saved.length, 0);
  }
});
test('cancel during analysis prevents result checkpoint', async () => {
  const f = setup(), controller = new AbortController();
  f.deps.analyze = async (input) => { controller.abort(); await input.checkpoint(result.analysis); return result.analysis; };
  await assert.rejects(createMontageExecutor(f.deps).execute({ job, signal: controller.signal }), { name: 'AbortError' }); assert.equal(f.saved.length, 0);
});
test('render recovery reuses the saved asset after checkpoint failure and its id works with the asset API', async () => {
  const f = setup(); let renderCalls = 0;
  const request: MontagePayload = { ...payload, request: { action: 'render', idempotencyKey: 'render', expectedRevision: 2 } };
  f.deps.readPayload = async () => request;
  let asset: Awaited<ReturnType<NonNullable<Deps['findAsset']>>> = null;
  f.deps.findAsset = async () => asset;
  f.deps.render = async () => { renderCalls++; return { bytes: new Uint8Array([1]), video: { durationSeconds: 5 } } as Awaited<ReturnType<NonNullable<Deps['render']>>>; };
  f.deps.persist = async (input) => {
    assert.ok(isUuidV7(input.requestedAssetId)); assert.equal(input.libraryVisible, true); assert.equal(input.generationJobId, job.id);
    const created = { id: input.requestedAssetId, workspaceId, operation: 'montage_render', status: 'ready', mediaKind: 'video', video: { durationSeconds: 5 } } as Awaited<ReturnType<NonNullable<Deps['persist']>>>;
    asset = created; return created;
  };
  f.deps.saveResult = async () => { throw new Error('Temporary storage outage'); };
  const changes = { operation: 'montage_render', provider: 'local', modelId: 'ffmpeg-montage-v1', metadata: { timelineId, requestHash: montageHash(request) } };
  await assert.rejects(execute(f, changes), { code: 'montage_checkpoint_unavailable', retryable: true });
  f.deps.saveResult = async (value) => { f.saved.push(value); };
  const recovered = await execute(f, { ...changes, attemptCount: 2 });
  assert.equal(renderCalls, 1); assert.ok(isUuidV7(recovered.assetId)); assert.equal(f.saved.length, 1);
});
