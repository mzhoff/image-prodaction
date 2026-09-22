import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { timelineVideoPositions } from './timeline-video';
import { emptyTimeline, timelineSnapshotSchema } from '../contracts/story-timeline';
import type { MontageSource, MusicAnalysis } from '../contracts/timeline-production';
import { mergeTimelineWrite, timelineAssetRequirements } from './timeline-media';
import { makeMontageSlots, applyMontageSelections } from './montage-plan';
import { exportTimelineOtio, importTimelineOtio } from './timeline-otio';
import { assertAssetRequirements } from '../server/story-service';

const videoId = randomUUID(), musicId = randomUUID();
const clip = { id: randomUUID(), shotId: null, assetId: videoId, kind: 'video' as const, sourceInMs: 1000, durationMs: 2000 };
const music: MusicAnalysis = { version: 1, assetId: musicId, checksum: 'a'.repeat(64), sourceInMs: 1000, durationMs: 8000,
  bpm: 120, confidence: 0.9, method: 'manual', beatsMs: Array.from({ length: 16 }, (_, i) => i * 500), energy: [{ timeMs: 0, value: 0.1 }, { timeMs: 5500, value: 1 }] };
const production = { purpose: 'promo' as const, brief: 'Нарастающее напряжение', targetDurationMs: 8000, pacing: 'dynamic' as const, sourceAssetIds: [videoId] };
const source: MontageSource = { id: 'source-1', assetId: videoId, checksum: 'b'.repeat(64), startMs: 0, endMs: 60000, description: 'Человек прыгает в воду' };

test('legacy writes preserve new audio, source catalogue and existing locks; explicit empty audio clears it', () => {
  const current = timelineSnapshotSchema.parse({ ...emptyTimeline(), clips: [clip], production, lockedClipIds: [clip.id],
    audioClips: [{ id: randomUUID(), assetId: musicId, startMs: 0, sourceInMs: 0, durationMs: 2000, gain: 0.7 }] });
  const saved = mergeTimelineWrite(current, { ...emptyTimeline(), clips: [clip] });
  assert.deepEqual(saved.audioClips, current.audioClips); assert.deepEqual(saved.production, production); assert.deepEqual(saved.lockedClipIds, [clip.id]);
  assert.deepEqual(mergeTimelineWrite(current, { ...emptyTimeline(), clips: [clip], audioClips: [] }).audioClips, []);
  assert.deepEqual(mergeTimelineWrite(current, emptyTimeline()).lockedClipIds, []);
  const requirements = timelineAssetRequirements(saved);
  assert.ok(requirements.some((r) => r.id === musicId && r.kind === 'audio'));
  assert.throws(() => assertAssetRequirements(requirements, [{ id: videoId, kind: 'video', metadata: { video: { durationSeconds: 4 } } }]), /недоступен/);
  assert.throws(() => assertAssetRequirements([{ id: musicId, kind: 'audio', endMs: 3000 }], [{ id: musicId, kind: 'audio', metadata: { audio: { durationSeconds: 2 } } }]), /Диапазон/);
});
test('music cells cover target once, preserve exact fixed clip and reject invented/repeated/outside ranges', () => {
  const snapshot = { ...emptyTimeline(), production, clips: [clip], lockedClipIds: [clip.id],
    audioClips: [{ id: randomUUID(), assetId: musicId, startMs: 0, sourceInMs: 0, durationMs: 1000, gain: 0.4, role: 'voice' as const }] };
  const slots = makeMontageSlots(snapshot, music);
  assert.equal(slots[0].lockedClipId, clip.id); assert.equal(slots.reduce((n, s) => n + s.durationMs, 0), 8000);
  assert.ok(slots.some((s) => s.role === 'climax'));
  let offset = 10000;
  const selections = { selections: slots.filter((s) => !s.lockedClipId).map((s) => { const sourceInMs = offset; offset += s.durationMs; return { slotId: s.id, sourceId: source.id, sourceInMs, reason: 'Пик действия' }; }) };
  const apply = (value: unknown) => applyMontageSelections({ snapshot, slots, sources: [source], selections: value, music, createId: randomUUID });
  const result = apply(selections); assert.deepEqual(result.clips[0], clip);
  assert.equal(result.audioClips?.length, 2); assert.deepEqual(result.audioClips?.[0], snapshot.audioClips[0]);
  assert.equal(result.audioClips?.[1].role, 'music');
  for (const change of [{ sourceId: 'invented' }, { sourceInMs: 59999 }, { sourceInMs: clip.sourceInMs }]) {
    assert.throws(() => apply({ selections: selections.selections.map((s, i) => i === 0 ? { ...s, ...change } : s) }));
  }
  assert.throws(() => apply({ selections: selections.selections.slice(1) }), /каждую/);
  assert.throws(() => makeMontageSlots(snapshot, { ...music, bpm: null, confidence: 0 }), /BPM/);
});
test('OTIO roundtrip preserves picture cuts, trims, audio offsets, gain and locks with explicit source bindings', () => {
  const snapshot = timelineSnapshotSchema.parse({ ...emptyTimeline('9:16'), frameRate: 25, clips: [clip], lockedClipIds: [clip.id], sourceAudioGain: 0,
    audioClips: [{ id: randomUUID(), assetId: musicId, startMs: 500, sourceInMs: 1500, durationMs: 1000, gain: 0.7, role: 'music' }] });
  const document = exportTimelineOtio('Promo', snapshot);
  const bindings = { [`asset://${videoId}`]: { assetId: videoId, kind: 'video' as const }, [`asset://${musicId}`]: { assetId: musicId, kind: 'audio' as const } };
  const result = importTimelineOtio(document, bindings, randomUUID);
  assert.deepEqual(timelineVideoPositions(result).map(({ id: _id, ...c }) => c), timelineVideoPositions(snapshot).map(({ id: _id, ...c }) => c));
  assert.deepEqual(result.audioClips?.map(({ id: _id, ...c }) => c), snapshot.audioClips?.map(({ id: _id, ...c }) => c));
  assert.equal(result.lockedClipIds?.[0], result.clips[0].id); assert.equal(result.aspectRatio, '9:16'); assert.equal(result.sourceAudioGain, 0);
  assert.throws(() => importTimelineOtio(document, {}, randomUUID), /Сопоставьте/);
  for (const alter of [
    (v: Record<string, unknown>) => { v.OTIO_SCHEMA = 'Transition.1'; },
    (v: Record<string, unknown>) => { v.effects = [{ OTIO_SCHEMA: 'LinearTimeWarp.1', time_scalar: 2 }]; },
    (v: Record<string, unknown>) => { v.enabled = false; },
  ]) {
    const changed = structuredClone(document); alter(changed.tracks.children[0].children[0]);
    assert.throws(() => importTimelineOtio(changed, bindings, randomUUID));
  }
});

test('AI rebuilds primary cuts while retaining auxiliary video lanes and their locks', () => {
  const track = { id: randomUUID(), name: 'Extra' }, overlay = { ...clip, id: randomUUID(), trackId: '', startMs: 6000 };
  overlay.trackId = track.id;
  const snapshot = { ...emptyTimeline(), production, clips: [overlay], videoTracks: [track], lockedClipIds: [overlay.id] };
  const slots = makeMontageSlots(snapshot, music); assert.ok(slots.every((slot) => !slot.lockedClipId));
  let offset = 10000;
  const selections = { selections: slots.map((slot) => { const sourceInMs = offset; offset += slot.durationMs; return { slotId: slot.id, sourceId: source.id, sourceInMs, reason: 'build' }; }) };
  const result = applyMontageSelections({ snapshot, music, slots, sources: [source], selections, createId: randomUUID });
  assert.deepEqual(result.clips.at(-1), overlay); assert.deepEqual(result.videoTracks, [track]); assert.deepEqual(result.lockedClipIds, [overlay.id]);
});
