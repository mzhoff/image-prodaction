import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { emptyTimeline, timelineSnapshotSchema } from '../contracts/story-timeline';
import type { MontageSlot } from '../contracts/timeline-production';
import { clipsFromScenes, moveAudioClip, normalizeAudioLanes, resizeMontageBoundary, reviewMontageSlots } from './timeline-track-editing';
import { exportTimelineOtio, importTimelineOtio } from './timeline-otio';
import { timelineAnalyzeRequestSchema } from '@/shared/media/timeline-request';

test('audio tracks retain empty lanes, reject overlap and support a move between lanes', () => {
  const a = { id: randomUUID(), assetId: randomUUID(), startMs: 1000, sourceInMs: 0, durationMs: 1000, gain: 1 };
  const b = { ...a, id: randomUUID() };
  const old = { ...emptyTimeline(), audioClips: [a, b] };
  const normalized = normalizeAudioLanes(old);
  assert.equal(normalized.audioTracks?.length, 2);
  assert.throws(() => moveAudioClip(normalized, b.id, a.id, 1500), /уже есть звук/);
  const moved = moveAudioClip(normalized, b.id, a.id, 3000);
  assert.equal(moved.audioClips?.[1].trackId, a.id);
  assert.equal(moved.audioTracks?.length, 2, 'empty track persists');
  assert.equal(timelineSnapshotSchema.safeParse(moved).success, true);
  assert.equal(timelineSnapshotSchema.safeParse({ ...moved, audioTracks: [] }).success, false);
  assert.equal(timelineSnapshotSchema.safeParse({ ...moved, audioClips: moved.audioClips?.map((c) => ({ ...c, startMs: 0 })) }).success, false);
});

test('reviewed grid preserves coverage and exact locks; resizing transfers length to its neighbour', () => {
  const lock = randomUUID();
  const slots: MontageSlot[] = [1000, 2000, 1000].map((durationMs, i, all) => ({ id: `slot-${i}`, startMs: all.slice(0, i).reduce((a, b) => a + b, 0), durationMs, energy: 0.5, role: 'build', ...(i === 2 ? { lockedClipId: lock } : {}) }));
  const changed = resizeMontageBoundary(slots, 0, 1500, 30);
  assert.deepEqual(changed.map((s) => s.durationMs), [1500, 1500, 1000]);
  assert.deepEqual(reviewMontageSlots(slots, changed), changed);
  assert.deepEqual(resizeMontageBoundary(slots, 1, 2500, 30), slots);
  assert.throws(() => reviewMontageSlots(slots, changed.map((s, i) => i === 1 ? { ...s, startMs: 1499 } : s)), /покрывать/);
  assert.throws(() => reviewMontageSlots(slots, changed.map((s, i) => i === 0 ? { ...s, lockedClipId: lock } : s)), /Закреплённые/);
  assert.throws(() => reviewMontageSlots(slots, changed.map((s, i) => i === 2 ? { ...s, lockedClipId: undefined } : s)), /Закреплённые/);
  assert.throws(() => reviewMontageSlots(slots, changed.slice(0, -1)), /покрывать/);
});

test('scene import keeps full source coverage including shots shorter than 100 ms', () => {
  const assetId = randomUUID();
  const clips = clipsFromScenes({ version: 1, sourceAssetId: assetId, sourceChecksum: 'a'.repeat(64), durationMs: 1120, frameTimesMs: [0, 30, 1100],
    shots: [{ id: '1', startMs: 0, endMs: 30, frames: [{ timeMs: 0 }], description: '' }, { id: '2', startMs: 30, endMs: 1100, frames: [{ timeMs: 30 }], description: '' }, { id: '3', startMs: 1100, endMs: 1120, frames: [{ timeMs: 1100 }], description: '' }] }, randomUUID);
  assert.equal(clips.length, 1); assert.equal(clips[0].durationMs, 1120); assert.equal(clips[0].sourceInMs, 0); assert.equal(clips[0].assetId, assetId);
  assert.equal(timelineAnalyzeRequestSchema.safeParse({ action: 'analyze', documentId: null, workspaceId: randomUUID(), assetId: '019f0000-0000-7000-8000-000000000003', idempotencyKey: 'standalone' }).success, true);
});

test('OTIO roundtrip retains named empty and multi-clip audio tracks, their order, gaps and trims', () => {
  const track1 = randomUUID(), track2 = randomUUID(), audio = randomUUID(), video = randomUUID();
  const snapshot = timelineSnapshotSchema.parse({ ...emptyTimeline(), clips: [{ id: randomUUID(), assetId: video, kind: 'video', sourceInMs: 0, durationMs: 6000, shotId: null }],
    audioTracks: [{ id: track2, name: 'Голос' }, { id: track1, name: 'Музыка' }], audioClips: [
      { id: randomUUID(), assetId: audio, trackId: track1, startMs: 500, sourceInMs: 2000, durationMs: 1000, gain: 0.7 },
      { id: randomUUID(), assetId: audio, trackId: track1, startMs: 3000, sourceInMs: 0, durationMs: 2000, gain: 1 },
    ] });
  const imported = importTimelineOtio(exportTimelineOtio('Tracks', snapshot), { [`asset://${audio}`]: { assetId: audio, kind: 'audio' }, [`asset://${video}`]: { assetId: video, kind: 'video' } }, randomUUID);
  assert.deepEqual(imported.audioTracks?.map((t) => t.name), ['Голос', 'Музыка']);
  assert.deepEqual(imported.audioClips?.map((c) => [c.startMs, c.sourceInMs, c.durationMs, c.gain]), [[500, 2000, 1000, 0.7], [3000, 0, 2000, 1]]);
  assert.ok(imported.audioClips?.every((c) => c.trackId === imported.audioTracks?.[1].id));
});
