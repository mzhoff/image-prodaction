import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { emptyTimeline, timelineSnapshotSchema, type TimelineSnapshot } from '../contracts/story-timeline';
import { timelineVideoDuration, timelineVideoSegments, timelineVideoPositions, moveVideoClip } from './timeline-video';
import { splitTimelineClip } from './timeline-split';
import { exportTimelineOtio, importTimelineOtio } from './timeline-otio';
import { mergeTimelineWrite } from './timeline-media';
const base = () => ({ id: randomUUID(), assetId: randomUUID(), shotId: null, kind: 'video' as const, sourceInMs: 2000, durationMs: 4000 });
function fixture(): TimelineSnapshot {
  const track = { id: randomUUID(), name: 'Верхний план' }, clip = base();
  return { ...emptyTimeline(), frameRate: 30, clips: [clip, { ...base(), trackId: track.id, startMs: 1000, durationMs: 1000, sourceInMs: 5000 }], videoTracks: [track] };
}
test('visible segments cover time once, retain source offsets and reveal lower video after overlay', () => {
  const snapshot = timelineSnapshotSchema.parse(fixture());
  assert.equal(timelineVideoDuration(snapshot), 4000);
  assert.deepEqual(timelineVideoPositions(snapshot).map((clip) => clip.startMs), [0, 1000]);
  assert.deepEqual(timelineVideoSegments(snapshot).map((clip) => [clip.startMs, clip.durationMs, clip.sourceInMs]), [[0, 1000, 2000], [1000, 1000, 5000], [2000, 2000, 4000]]);
});
test('layer ordering and black gaps are deterministic and do not create fake source requests', () => {
  const snapshot = fixture(), upper = { id: randomUUID(), name: 'Выше' };
  snapshot.videoTracks!.push(upper); snapshot.clips.push({ ...base(), trackId: upper.id, startMs: 1500, durationMs: 1000 });
  assert.equal(timelineVideoSegments(snapshot).find((clip) => clip.startMs === 1500)?.assetId, snapshot.clips[2].assetId);
  snapshot.clips = [snapshot.clips[1]];
  assert.deepEqual(timelineVideoSegments(snapshot).map((clip) => [clip.kind, clip.startMs, clip.durationMs]), [['gap', 0, 1000], ['video', 1000, 1000]]);
});
test('moving onto another video lane keeps source; overlaps and orphan lane references are rejected', () => {
  const snapshot = fixture(), overlay = snapshot.clips[1];
  assert.throws(() => moveVideoClip(snapshot, snapshot.clips[0].id, overlay.trackId!, 0), /уже есть/);
  const moved = moveVideoClip(snapshot, overlay.id, 'primary', 5000);
  const movedClip = moved.clips.find((clip) => clip.id === overlay.id)!;
  assert.equal(movedClip.sourceInMs, 5000); assert.equal(movedClip.trackId, undefined); assert.equal(movedClip.startMs, 5000);
  assert.equal(timelineSnapshotSchema.safeParse({ ...snapshot, videoTracks: [] }).success, false);
  assert.equal(timelineSnapshotSchema.safeParse({ ...snapshot, clips: [...snapshot.clips, { ...overlay, id: randomUUID(), startMs: 1200 }] }).success, false);
});
test('split primary and overlay preserves total duration, exact ranges, track placement and locks', () => {
  const snapshot = fixture(); snapshot.lockedClipIds = [snapshot.clips[1].id];
  const secondId = randomUUID(), split = splitTimelineClip(snapshot, 'video', snapshot.clips[1].id, 1500, () => secondId);
  assert.deepEqual(split.clips.slice(1).map((clip) => [clip.startMs, clip.sourceInMs, clip.durationMs]), [[1000, 5000, 500], [1500, 5500, 500]]);
  assert.deepEqual(split.lockedClipIds, [snapshot.clips[1].id, secondId]); assert.equal(timelineVideoDuration(split), 4000);
  const primary = splitTimelineClip(snapshot, 'video', snapshot.clips[0].id, 500, randomUUID);
  assert.deepEqual(primary.clips.slice(0, 2).map((clip) => [clip.sourceInMs, clip.durationMs, clip.startMs]), [[2000, 500, undefined], [2500, 3500, undefined]]);
  assert.throws(() => splitTimelineClip(snapshot, 'video', snapshot.clips[0].id, 30, randomUUID), /0,1/);
});
test('splitting an image retains zero source offset; legacy audio gets one shared lane', () => {
  const image = { ...base(), kind: 'image' as const, sourceInMs: 0 }, audio = { id: randomUUID(), assetId: randomUUID(), startMs: 200, sourceInMs: 300, durationMs: 2000, gain: .5 };
  const snapshot: TimelineSnapshot = { ...emptyTimeline(), clips: [image], audioClips: [audio] };
  const images = splitTimelineClip(snapshot, 'video', image.id, 500, randomUUID); assert.deepEqual(images.clips.map((clip) => clip.sourceInMs), [0, 0]);
  const split = splitTimelineClip(snapshot, 'audio', audio.id, 1200, randomUUID);
  assert.equal(split.audioTracks?.length, 1); assert.equal(split.audioClips?.[0].trackId, split.audioClips?.[1].trackId);
  assert.deepEqual(split.audioClips?.map((clip) => [clip.startMs, clip.sourceInMs, clip.durationMs, clip.gain]), [[200, 300, 1000, .5], [1200, 1300, 1000, .5]]);
});
test('layered OTIO roundtrip keeps empty lanes, gaps, stack order and visible source ranges', () => {
  const snapshot = fixture(); snapshot.videoTracks!.push({ id: randomUUID(), name: 'Пустая' });
  const document = exportTimelineOtio('Layers', snapshot);
  const bindings = Object.fromEntries(snapshot.clips.map((clip) => [`asset://${clip.assetId}`, { assetId: clip.assetId, kind: clip.kind }]));
  const imported = importTimelineOtio(JSON.parse(JSON.stringify(document)), bindings, randomUUID);
  assert.deepEqual(imported.videoTracks?.map((track) => track.name), ['Верхний план', 'Пустая']);
  const layout = (value: TimelineSnapshot) => timelineVideoSegments(value).map(({ id: _id, ...clip }) => clip);
  assert.deepEqual(layout(imported), layout(snapshot));
});
test('older writes cannot silently turn auxiliary video clips into primary cuts', () => {
  const snapshot = fixture(); snapshot.lockedClipIds = [snapshot.clips[1].id];
  const old = { ...emptyTimeline(), clips: snapshot.clips.map(({ trackId: _track, startMs: _start, ...clip }) => clip) };
  const next = timelineSnapshotSchema.parse(mergeTimelineWrite(snapshot, old));
  assert.deepEqual(next.videoTracks, snapshot.videoTracks); assert.deepEqual(next.clips[1], snapshot.clips[1]); assert.deepEqual(next.lockedClipIds, snapshot.lockedClipIds);
});
