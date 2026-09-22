import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { emptyTimeline, type TimelineSnapshot } from '../contracts/story-timeline';
import { attachTimelineAudio } from './timeline-linked-clips';
import { placeTimelineClip, timelineClipDurationLimit, timelineInsertionStart } from './timeline-placement';

const video = (startMs: number, durationMs: number, trackId?: string) => ({ id: randomUUID(), assetId: randomUUID(), kind: 'video' as const, shotId: null, sourceInMs: 0, startMs, durationMs, ...(trackId ? { trackId } : {}) });
const snapshot = (...clips: TimelineSnapshot['clips']): TimelineSnapshot => ({ ...emptyTimeline(), clips });

test('drag stops exactly against either neighbour, even when the pointer jumps across a whole clip', () => {
  const moving = video(2000, 4000), next = video(8000, 4000), before = video(0, 1000), value = snapshot(before, moving, next);
  assert.equal(placeTimelineClip(value, 'video', moving.id, 'primary', 30_000)!.startMs, 4000);
  assert.equal(placeTimelineClip(value, 'video', moving.id, 'primary', -1000)!.startMs, 1000);
  assert.equal(value.clips[1].startMs, 2000);
});

test('lane entry fits an adjacent edge but never jumps across a short gap or shortens the clip', () => {
  const lane = randomUUID(), moving = video(0, 4000), value = snapshot(moving, video(1000, 4000, lane), video(7000, 3000, lane));
  value.videoTracks = [{ id: lane, name: 'Вторая' }];
  assert.equal(placeTimelineClip(value, 'video', moving.id, lane, 4500), null);
  const placed = placeTimelineClip(value, 'video', moving.id, lane, 8000)!;
  assert.equal(placed.startMs, 10000); assert.equal(placed.snapshot.clips.find((clip) => clip.id === moving.id)!.durationMs, 4000);
  // After entering the new lane, that gap becomes the boundary for the rest of the gesture.
  assert.equal(placeTimelineClip(value, 'video', moving.id, lane, 0, placed.snapshot)!.startMs, 10000);
});

test('linked pair respects audio obstacles when dragging video, and video obstacles when dragging sound', () => {
  const moving = video(0, 4000);
  const value = attachTimelineAudio(snapshot(moving, video(8000, 4000)), moving.id, randomUUID(), randomUUID);
  const sound = value.audioClips![0];
  value.audioClips!.push({ id: randomUUID(), assetId: randomUUID(), trackId: sound.trackId, startMs: 5000, sourceInMs: 0, durationMs: 3000, gain: 1 });
  const placed = placeTimelineClip(value, 'video', moving.id, 'primary', 6000)!;
  assert.equal(placed.startMs, 1000); assert.equal(placed.snapshot.audioClips![0].startMs, 1000);
  const lane = randomUUID(); value.audioTracks!.push({ id: lane, name: 'Пустая' });
  const audioMove = placeTimelineClip(value, 'audio', sound.id, lane, 6000)!;
  assert.equal(audioMove.startMs, 4000); assert.equal(audioMove.snapshot.clips.find((clip) => clip.id === moving.id)!.startMs, 4000);
  assert.equal(timelineClipDurationLimit(value, 'video', moving.id), 5000);
  assert.equal(timelineClipDurationLimit(value, 'audio', sound.id), 5000);
});

test('material insertion uses the whole duration and rejects a gap that is too short', () => {
  const value = snapshot(video(1000, 4000), video(7000, 3000));
  assert.equal(timelineInsertionStart(value, 'video', 'primary', 4000, 4500), null);
  assert.equal(timelineInsertionStart(value, 'video', 'primary', 1000, 5500), 5500);
  assert.equal(timelineInsertionStart(value, 'video', 'primary', 3000, 0), null);
});

test('touching clips have no room to grow until the neighbour moves, including legacy sequential clips', () => {
  const first = video(0, 4000), second = video(4000, 4000), value = snapshot(first, second);
  delete value.clips[0].startMs; delete value.clips[1].startMs;
  assert.equal(timelineClipDurationLimit(value, 'video', first.id), 4000);
  assert.equal(placeTimelineClip(value, 'video', first.id, 'primary', 2000)!.startMs, 0);
});
