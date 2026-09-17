import assert from 'node:assert/strict';
import test from 'node:test';
import type { VideoAssetDto } from '@/entities/asset/server/video-asset-service';
import { DEFAULT_TIMELINE_MODEL } from '@/shared/api/timeline-models';
import { timelineAnalysisSchema, timelineShotFingerprint, type TimelineDescriptionResult, type TimelineShot } from '@/shared/media/timeline-contracts';
import { generateTimeline, type QueuedTimelinePayload, type TimelineGenerationDependencies, type TimelineResult } from './timeline-generation';

const workspaceId = '019f0000-0000-7000-8000-000000000001';
const documentId = '019f0000-0000-7000-8000-000000000002';
const assetId = '019f0000-0000-7000-8000-000000000003';
const checksum = 'a'.repeat(64);
const sourceBytes = new Uint8Array([7, 8, 9]);
const video: VideoAssetDto['video'] = { container: 'mp4', codec: 'h264', contentType: 'video/mp4', durationSeconds: 2,
  width: 160, height: 120, frameRate: 10, rotationDegrees: 0, audioTracks: [], browserPlayable: true };
const asset: VideoAssetDto = { id: assetId, video, byteSize: 3, checksumSha256: checksum, contentType: 'video/mp4', createdAt: '', updatedAt: '',
  documentId, workspaceId, generationJobId: null, width: 160, height: 120, libraryVisible: false, mediaKind: 'video', metadata: { video },
  modelId: null, operation: 'upload_video', origin: 'uploaded', originalName: 'clip.mp4', provider: null, status: 'ready' };
const shots: TimelineShot[] = [
  { id: 'one', startMs: 0, endMs: 1000, frames: [{ timeMs: 700 }, { timeMs: 300 }], description: 'Manual text.' },
  { id: 'two', startMs: 1000, endMs: 2000, frames: [{ timeMs: 1400 }], description: '' },
];
function setup(action: 'analyze' | 'describe' = 'describe') {
  const controller = new AbortController(); const snapshots: TimelineResult[] = [];
  const descriptions: Parameters<TimelineGenerationDependencies['describe']>[0][] = [];
  const frames: Parameters<TimelineGenerationDependencies['frame']>[0][] = [];
  let analyses = 0; let batches = 0; let sourceReads = 0;
  const payload: QueuedTimelinePayload = { userId: 'author', sourceChecksum: checksum, request: action === 'analyze'
    ? { action, workspaceId, documentId, assetId, idempotencyKey: 'logical', threshold: 10 }
    : { action, workspaceId, documentId, assetId, idempotencyKey: 'logical', sourceChecksum: checksum, shots: structuredClone(shots), model: DEFAULT_TIMELINE_MODEL, language: 'ru' } };
  const dependencies: TimelineGenerationDependencies = {
    readSource: async (input) => { sourceReads += 1; assert.equal(input.workspaceId, workspaceId); assert.equal(input.assetId, assetId); return { asset, video, bytes: sourceBytes }; },
    analyze: async (input) => { analyses += 1; assert.equal(input.bytes, sourceBytes); assert.equal(input.threshold, 10);
      return { durationMs: 2000, frameTimesMs: [0, 300, 700, 1000, 1400], shots: [{ startMs: 0, endMs: 1000, frameTimesMs: [300] }, { startMs: 1000, endMs: 2000, frameTimesMs: [1400] }] }; },
    withFrames: async (input, work) => { batches += 1; assert.equal(input.bytes, sourceBytes); return work(async (timeMs) => new Uint8Array([timeMs / 100])); },
    frame: async (input) => { frames.push(input); assert.equal(input.assetId, assetId); assert.equal(input.sourceBytes, sourceBytes); assert.ok(input.extract);
      return { assetId, bytes: await input.extract(input.timeMs) }; },
    describe: async (input) => { descriptions.push(input); return { id: input.shot.id, description: `Description ${input.shot.id}.`, describedFingerprint: timelineShotFingerprint(input.shot) }; },
  };
  const input: Parameters<typeof generateTimeline>[0] = { payload, jobId: 'parent-job', signal: controller.signal,
    assertActive: async () => controller.signal.throwIfAborted(), checkpoint: async (result) => { snapshots.push(structuredClone(result)); } };
  return { input, dependencies, snapshots, descriptions, frames, controller, counts: () => ({ analyses, batches, sourceReads }) };
}

test('analysis is local only and returns a validated continuous PTS timeline without any image/provider stage', async () => {
  const fixture = setup('analyze'); const result = await generateTimeline(fixture.input, fixture.dependencies);
  assert.equal(timelineAnalysisSchema.safeParse(result).success, true);
  assert.equal(fixture.descriptions.length, 0); assert.equal(fixture.frames.length, 0); assert.equal(fixture.counts().batches, 0);
  assert.equal(fixture.counts().analyses, 1); assert.equal(fixture.snapshots.length, 1);
});

test('description uses only selected source stills in chronological order, one shared reader, per-shot checkpoints', async () => {
  const fixture = setup(); const result = await generateTimeline(fixture.input, fixture.dependencies);
  assert.equal(fixture.counts().analyses, 0); assert.equal(fixture.counts().batches, 1);
  assert.deepEqual(fixture.frames.map((frame) => frame.timeMs), [300, 700, 1400]);
  assert.deepEqual(fixture.descriptions[0]!.images.map((image) => [...image]), [[3], [7]]);
  assert.ok(fixture.descriptions.every((call) => call.workspaceId === workspaceId && call.actorUserId === 'author' && call.parentJobId === 'parent-job'));
  assert.deepEqual(result.shots.map((shot) => shot.id), ['one', 'two']);
  assert.deepEqual(fixture.snapshots.map((snapshot) => snapshot.shots.length), [1, 2]);
});

test('matching partial checkpoint skips completed paid shots; completed checkpoint does not even reopen a decoder', async () => {
  const fixture = setup(); const previous: TimelineDescriptionResult = { sourceAssetId: assetId, sourceChecksum: checksum,
    shots: [{ id: 'one', description: 'Already paid.', describedFingerprint: timelineShotFingerprint(shots[0]!) }] };
  fixture.input.previous = previous;
  const result = await generateTimeline(fixture.input, fixture.dependencies);
  assert.deepEqual(fixture.descriptions.map((call) => call.shot.id), ['two']); assert.deepEqual(fixture.frames.map((frame) => frame.timeMs), [1400]);
  assert.equal(result.shots[0]!.description, 'Already paid.'); assert.equal(previous.shots.length, 1);
  const replay = setup(); replay.input.previous = result;
  await generateTimeline(replay.input, replay.dependencies);
  assert.equal(replay.counts().batches, 0); assert.equal(replay.descriptions.length, 0);
});

test('changed source, out-of-source ranges and mismatched prior description fingerprint stop before any paid work', async () => {
  const changed = setup(); changed.input.payload.sourceChecksum = 'b'.repeat(64);
  await assert.rejects(generateTimeline(changed.input, changed.dependencies), { code: 'timeline_source_changed' });
  const range = setup(); if (range.input.payload.request.action === 'describe') range.input.payload.request.shots[1]!.endMs = 2100;
  await assert.rejects(generateTimeline(range.input, range.dependencies), { code: 'invalid_timeline_range' });
  const stale = setup(); stale.input.previous = { sourceAssetId: assetId, sourceChecksum: checksum,
    shots: [{ id: 'one', description: 'Old cut.', describedFingerprint: 'different' }] };
  await assert.rejects(generateTimeline(stale.input, stale.dependencies), { code: 'invalid_timeline_checkpoint' });
  for (const fixture of [changed, range, stale]) { assert.equal(fixture.descriptions.length, 0); assert.equal(fixture.counts().batches, 0); }
});

test('cancel after a checkpoint retains completed description and prevents dispatch for the next shot', async () => {
  const fixture = setup(); const checkpoint = fixture.input.checkpoint;
  fixture.input.checkpoint = async (result) => { await checkpoint(result); fixture.controller.abort(); };
  await assert.rejects(generateTimeline(fixture.input, fixture.dependencies), { name: 'AbortError' });
  assert.equal(fixture.snapshots.length, 1); assert.equal(fixture.descriptions.length, 1);
});

test('lease loss after local frame preparation prevents model dispatch', async () => {
  const fixture = setup(); fixture.input.assertActive = async () => { if (fixture.frames.length) throw new Error('lease lost'); };
  await assert.rejects(generateTimeline(fixture.input, fixture.dependencies), /lease lost/);
  assert.equal(fixture.descriptions.length, 0); assert.equal(fixture.snapshots.length, 0);
});
