import assert from 'node:assert/strict';
import test from 'node:test';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { AudioProcessingError } from '@/shared/media/audio-contracts';
import { VideoProcessingError } from '@/shared/media/video-contracts';
import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { createTimelineGenerationExecutor } from './timeline-generation-executor';
import { timelinePayloadHash, type QueuedTimelinePayload } from './timeline-generation';
import { ShortAiExecutionError } from './short-ai-execution-contracts';

const workspaceId = '019f0000-0000-7000-8000-000000000001';
const documentId = '019f0000-0000-7000-8000-000000000002';
const assetId = '019f0000-0000-7000-8000-000000000003';
const payload: QueuedTimelinePayload = { userId: 'author', sourceChecksum: 'a'.repeat(64),
  request: { action: 'analyze', workspaceId, documentId, assetId, threshold: 10, idempotencyKey: 'logical' } };
const analysis: TimelineAnalysis = { version: 1, sourceAssetId: assetId, sourceChecksum: payload.sourceChecksum,
  durationMs: 1000, frameTimesMs: [0, 300, 700], shots: [{ id: 'one', startMs: 0, endMs: 1000, frames: [{ timeMs: 300 }], description: '' }] };
const job: GenerationJobDto = { id: 'parent-job', workspaceId, documentId, operation: 'timeline_analyze', requestObjectKey: 'payload',
  status: 'running', attemptCount: 1, maxAttempts: 2, provider: 'local', modelId: 'ffmpeg-scdet-v1',
  metadata: { requestHash: timelinePayloadHash(payload), timelineVersion: 1 }, idempotencyKey: 'logical', idempotentReplay: false,
  error: null, finalAssetId: null, createdAt: '', updatedAt: '', finishedAt: null, startedAt: new Date().toISOString(), leaseExpiresAt: '',
  usage: { complete: false, inputTokens: null, outputTokens: null, totalTokens: null, providerCostUsd: null, internalCreditsBalanceAfter: null, internalCreditsCharged: null } };

type Dependencies = NonNullable<Parameters<typeof createTimelineGenerationExecutor>[0]>;
function setup() {
  const saved: Parameters<Dependencies['saveResult']>[0][] = []; let calls = 0; let authorized = 0;
  const record = { createdByUserId: 'author', resultObjectKey: null } as Awaited<ReturnType<Dependencies['getRecord']>>;
  const dependencies: Dependencies = {
    authorize: async (userId, target) => { authorized += 1; assert.equal(userId, 'author'); assert.equal(target, workspaceId); },
    assertActive: async (_jobId, _attempt, signal) => signal.throwIfAborted(),
    getRecord: async () => record, readPayload: async () => structuredClone(payload), readResult: async () => structuredClone(analysis),
    saveResult: async (input) => { saved.push(input); },
    saveProgress: async () => {},
    generate: async (input) => { calls += 1; await input.assertActive(); await input.checkpoint(analysis); return analysis; },
  };
  return { dependencies, record, saved, calls: () => calls, authorized: () => authorized };
}
const execute = (fixture: ReturnType<typeof setup>, override: Partial<GenerationJobDto> = {}) => createTimelineGenerationExecutor(fixture.dependencies).execute({ job: { ...job, ...override }, signal: new AbortController().signal });

test('durable timeline executor rechecks membership, checkpoints with owned attempt and avoids double counting child usage', async () => {
  const fixture = setup(); const result = await execute(fixture);
  assert.equal(fixture.calls(), 1); assert.ok(fixture.authorized() >= 3); assert.equal(fixture.saved.length, 1);
  assert.equal(fixture.saved[0]!.jobId, job.id); assert.equal(fixture.saved[0]!.attemptCount, 1);
  assert.equal(fixture.saved[0]!.workspaceId, workspaceId); assert.equal(fixture.saved[0]!.providerOperationId, null);
  assert.equal(result.usage.providerCostUsd, null);
});

test('completed deterministic analysis checkpoint is reused without native re-analysis', async () => {
  const fixture = setup(); fixture.record.resultObjectKey = 'checkpoint';
  await execute(fixture, { attemptCount: 2 });
  assert.equal(fixture.calls(), 0); assert.equal(fixture.saved.length, 0);
});

test('queued immutable scope and source hash mismatch stop before generation', async () => {
  for (const mutate of [
    (fixture: ReturnType<typeof setup>) => { fixture.dependencies.readPayload = async () => ({ ...payload, userId: 'other' }); },
    (fixture: ReturnType<typeof setup>) => { fixture.dependencies.readPayload = async () => ({ ...payload, sourceChecksum: 'b'.repeat(64) }); },
    (fixture: ReturnType<typeof setup>) => { fixture.dependencies.readPayload = async () => ({ ...payload, request: { ...payload.request, workspaceId: 'other' } }); },
    (fixture: ReturnType<typeof setup>) => { fixture.record.createdByUserId = 'other'; fixture.dependencies.authorize = async () => undefined; },
  ]) {
    const fixture = setup(); mutate(fixture);
    await assert.rejects(execute(fixture), { code: 'timeline_scope_mismatch', retryable: false }); assert.equal(fixture.calls(), 0);
  }
});

test('restored analysis must belong to the immutable source, not merely match the shape', async () => {
  const fixture = setup(); fixture.record.resultObjectKey = 'checkpoint';
  fixture.dependencies.readResult = async () => ({ ...analysis, sourceChecksum: 'b'.repeat(64) });
  await assert.rejects(execute(fixture));
  assert.equal(fixture.calls(), 0);
});

test('revoked membership and expired original deadline prevent new local or paid work', async () => {
  const revoked = setup(); revoked.dependencies.authorize = async () => { throw new Error('membership revoked'); };
  await assert.rejects(execute(revoked), /membership revoked/); assert.equal(revoked.calls(), 0);
  const expired = setup();
  await assert.rejects(execute(expired, { startedAt: new Date(Date.now() - 21 * 60_000).toISOString(), attemptCount: 2 }), { code: 'timeline_timeout', retryable: false });
  assert.equal(expired.calls(), 0);
});

test('ambiguous paid outcome is terminal; decoder busy can retry; invalid media cannot', async () => {
  const cases = [
    { error: new ShortAiExecutionError({ classification: 'ambiguous', code: 'timeout', httpStatus: 504,
      message: 'Provider outcome unknown.', providerOperationId: 'paid', retryAfterMs: null }), code: 'timeout', retryable: false },
    { error: new AudioProcessingError('audio_busy', 'Media workers busy.', 503), code: 'audio_busy', retryable: true },
    { error: new VideoProcessingError('invalid_timeline_video', 'Invalid video.'), code: 'invalid_timeline_video', retryable: false },
  ];
  for (const item of cases) {
    const fixture = setup(); fixture.dependencies.generate = async () => { throw item.error; };
    await assert.rejects(execute(fixture), { code: item.code, retryable: item.retryable }); assert.equal(fixture.saved.length, 0);
  }
});

test('cancellation before saving a result cannot persist an apparently successful checkpoint', async () => {
  const fixture = setup(); const controller = new AbortController();
  fixture.dependencies.generate = async (input) => { controller.abort(); await input.checkpoint(analysis); return analysis; };
  await assert.rejects(createTimelineGenerationExecutor(fixture.dependencies).execute({ job, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fixture.saved.length, 0);
});
