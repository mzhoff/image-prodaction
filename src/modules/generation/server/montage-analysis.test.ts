import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TIMELINE_MODEL } from '@/shared/api/timeline-models';
import { randomUUID } from 'node:crypto';
import { emptyTimeline } from '@/modules/story-projects/contracts/story-timeline';
import type { MontageAnalysis } from '@/modules/story-projects/contracts/timeline-production';
import { analyzeMontage } from './montage-analysis';
import { montageHash, montagePayloadSchema, type MontagePayload } from './montage-contracts';
import { withManualBeatGrid } from '@/modules/story-projects/core/montage-plan';

const videoId = randomUUID(), musicId = randomUUID();
const payload: MontagePayload = { version: 1, userId: 'author', workspaceId: randomUUID(), timelineId: randomUUID(), revision: 0, name: 'Promo',
  snapshot: { ...emptyTimeline(), production: { purpose: 'promo', sourceAssetIds: [videoId], targetDurationMs: 5000, pacing: 'mixed', brief: 'A story' } },
  request: { action: 'analyze', model: DEFAULT_TIMELINE_MODEL, expectedRevision: 0, idempotencyKey: 'request', musicAssetId: musicId, musicSourceInMs: 0, beatOffsetMs: 0 },
  checksums: { [videoId]: 'a'.repeat(64), [musicId]: 'b'.repeat(64) } };
function setup() {
  const saved: MontageAnalysis[] = [], described: number[][] = [];
  let musicCalls = 0;
  const deps: NonNullable<Parameters<typeof analyzeMontage>[1]> = {
    analyzeVideo: async () => ({ durationMs: 6000, frameTimesMs: [0, 500, 1000, 1500, 2000, 3000, 3500, 4000, 4500, 5000, 5500],
      shots: [{ startMs: 0, endMs: 3000, frameTimesMs: [1000] }, { startMs: 3000, endMs: 6000, frameTimesMs: [4500] }] }),
    analyzeMusic: async () => { musicCalls++; return { bpm: 120, confidence: 1, beatsMs: [0, 500, 1000], energy: [{ timeMs: 0, value: 0.5 }], method: 'manual' }; },
    readFrames: async (_input, work) => work(async () => new Uint8Array([1])),
    describe: async ({ shot }) => { described.push(shot.frames.map((frame) => frame.timeMs)); return { id: shot.id, description: 'Visible action', describedFingerprint: 'test' }; },
  };
  const input = { payload, jobId: randomUUID(), signal: AbortSignal.timeout(10000), load: async () => ({ bytes: new Uint8Array([1]) }),
    assertActive: async () => {}, checkpoint: async (analysis: MontageAnalysis) => { saved.push(structuredClone(analysis)); } };
  return { deps, input, saved, described, musicCalls: () => musicCalls };
}
test('shot descriptions use real ordered first/middle/last timestamps; checkpoints resume without paying for completed shots', async () => {
  const f = setup(), complete = await analyzeMontage(f.input, f.deps);
  assert.equal(complete.complete, true); assert.deepEqual(f.described, [[0, 1000, 2000], [3000, 4500, 5500]]);
  const firstShot = f.saved.find((a) => a.sources.length === 1)!;
  const resumed = setup(); await analyzeMontage({ ...resumed.input, previous: firstShot }, resumed.deps);
  assert.equal(resumed.musicCalls(), 0); assert.deepEqual(resumed.described, [[3000, 4500, 5500]]);
  const musicChanged = setup(); await analyzeMontage({ ...musicChanged.input, payload: { ...payload, analysis: { ...complete, complete: false, music: null } } }, musicChanged.deps);
  assert.equal(musicChanged.musicCalls(), 1); assert.equal(musicChanged.described.length, 0);
});
test('description cap is checked before any paid call, and checkpoints from other sources are rejected', async () => {
  const f = setup(); f.deps.analyzeVideo = async () => ({ durationMs: 6100, frameTimesMs: [0], shots: Array.from({ length: 61 }, (_, i) => ({ startMs: i * 100, endMs: (i + 1) * 100, frameTimesMs: [i * 100] })) });
  await assert.rejects(analyzeMontage(f.input, f.deps), /60 сцен/); assert.equal(f.described.length, 0);
  const other = setup(); const previous: MontageAnalysis = { version: 1, complete: false, completedAssetIds: [], music: null,
    sources: [{ id: 'other', assetId: videoId, checksum: 'c'.repeat(64), startMs: 0, endMs: 500, description: 'Other' }] };
  await assert.rejects(analyzeMontage({ ...other.input, previous }, other.deps), /другим исходникам/); assert.equal(other.musicCalls(), 0);
});
test('job fingerprint survives schema/JSON key ordering; manual BPM reuses the unchanged analysis', async () => {
  assert.equal(montageHash(payload), montageHash(montagePayloadSchema.parse(payload)));
  const f = setup(), complete = await analyzeMontage(f.input, f.deps), original = structuredClone(complete.music!);
  const grid = withManualBeatGrid(complete.music!, 100, 50);
  assert.deepEqual(complete.music, original); assert.deepEqual(grid.energy, original.energy); assert.equal(grid.beatsMs[1], 650);
});
