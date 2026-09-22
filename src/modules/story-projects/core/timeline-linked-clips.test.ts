import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { emptyTimeline, timelineSnapshotSchema, type TimelineSnapshot } from '../contracts/story-timeline';
import { attachTimelineAudio, moveLinkedTimelineClip, synchronizeTimelineLinks, unlinkTimelineClip } from './timeline-linked-clips';
import { timelineVideoPositions, timelineVideoSegments } from './timeline-video';
import { splitTimelineClip } from './timeline-split';
import { snapTimelineClip } from './timeline-snapping';
import { exportTimelineOtio, importTimelineOtio } from './timeline-otio';
import { timelineAssetRequirements } from './timeline-media';
import { assertAssetRequirements } from '../server/story-service';

function pair() {
  const snapshot: TimelineSnapshot = { ...emptyTimeline(), clips: [{ id: randomUUID(), assetId: randomUUID(), shotId: null, kind: 'video', sourceInMs: 1000, durationMs: 4000 }] };
  return attachTimelineAudio(snapshot, snapshot.clips[0].id, randomUUID(), randomUUID);
}
test('adding sound mutes embedded audio, shares source range and persists the pair', () => {
  const snapshot = pair(), audio = snapshot.audioClips![0];
  assert.equal(audio.linkedVideoClipId, snapshot.clips[0].id);
  assert.equal(audio.sourceInMs, 1000); assert.equal(audio.durationMs, 4000);
  assert.equal(snapshot.clips[0].sourceAudioMuted, true);
  assert.equal(audio.allowSilentTail, true);
  assert.equal(timelineVideoSegments(snapshot)[0].sourceAudioMuted, true);
  assert.deepEqual(timelineSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot))), snapshot);
});
test('moving either side moves the pair once, keeps free gaps and permits track changes', () => {
  const snapshot = pair(), track = randomUUID(); snapshot.videoTracks = [{ id: track, name: 'Видео 2' }];
  const moved = moveLinkedTimelineClip(snapshot, 'video', snapshot.clips[0].id, track, 7000);
  assert.equal(moved.clips[0].startMs, 7000); assert.equal(moved.audioClips![0].startMs, 7000);
  assert.equal(moved.clips[0].trackId, track); assert.equal(snapshot.audioClips![0].startMs, 0);
  const back = moveLinkedTimelineClip(moved, 'audio', moved.audioClips![0].id, moved.audioClips![0].trackId!, 2000);
  assert.equal(back.clips[0].startMs, 2000); assert.equal(back.audioClips![0].startMs, 2000);
});
test('linked moves reject a collision on either destination lane', () => {
  const snapshot = pair(), audio = snapshot.audioClips![0];
  snapshot.audioClips!.push({ id: randomUUID(), assetId: randomUUID(), trackId: audio.trackId, startMs: 5000, sourceInMs: 0, durationMs: 3000, gain: 1 });
  assert.throws(() => moveLinkedTimelineClip(snapshot, 'video', snapshot.clips[0].id, 'primary', 4000), /наложения звуков/);
});
for (const kind of ['video', 'audio'] as const) test(`splitting ${kind} cuts both sources and preserves two independent links`, () => {
  const snapshot = pair(), id = kind === 'video' ? snapshot.clips[0].id : snapshot.audioClips![0].id;
  const split = splitTimelineClip(snapshot, kind, id, 1500, randomUUID);
  assert.equal(split.clips.length, 2); assert.equal(split.audioClips!.length, 2);
  assert.deepEqual(split.audioClips!.map((clip) => [clip.startMs, clip.durationMs, clip.sourceInMs]), [[0, 1500, 1000], [1500, 2500, 2500]]);
  assert.deepEqual(split.audioClips!.map((clip) => clip.linkedVideoClipId), split.clips.map((clip) => clip.id));
  const moved = moveLinkedTimelineClip(split, 'video', split.clips[1].id, 'primary', 6000);
  assert.deepEqual(moved.audioClips!.map((clip) => clip.startMs), [0, 6000]);
});
test('range editing and deletion apply to a pair; unlink preserves audio and native mute', () => {
  const snapshot = pair(), clip = snapshot.clips[0];
  const edited = synchronizeTimelineLinks(snapshot, { ...snapshot, clips: [{ ...clip, sourceInMs: 1500, durationMs: 3000 }] });
  assert.equal(edited.audioClips![0].sourceInMs, 1500); assert.equal(edited.audioClips![0].durationMs, 3000);
  assert.equal(synchronizeTimelineLinks(snapshot, { ...snapshot, clips: [] }).audioClips!.length, 0);
  assert.equal(synchronizeTimelineLinks(snapshot, { ...snapshot, audioClips: [] }).clips.length, 0);
  const independent = unlinkTimelineClip(snapshot, 'audio', snapshot.audioClips![0].id);
  const moved = moveLinkedTimelineClip(independent, 'video', clip.id, 'primary', 8000);
  assert.equal(moved.audioClips![0].startMs, 0); assert.equal(moved.clips[0].sourceAudioMuted, true);
  assert.equal(splitTimelineClip(independent, 'video', clip.id, 1500, randomUUID).audioClips!.length, 1);
});
test('primary lane materializes legacy positions without shifting neighbouring clips', () => {
  const snapshot = pair(), extra = { ...snapshot.clips[0], id: randomUUID(), sourceAudioMuted: false };
  snapshot.clips.push(extra);
  const moved = moveLinkedTimelineClip(snapshot, 'video', snapshot.clips[0].id, 'primary', 9000);
  assert.equal(timelineVideoPositions(moved).find((clip) => clip.id === extra.id)!.startMs, 4000);
  assert.equal(timelineVideoSegments(moved)[0].kind, 'gap');
});
test('snap leading/trailing edges in a pixel threshold, exclude linked sound, disable cleanly', () => {
  const snapshot = pair(), id = snapshot.clips[0].id;
  snapshot.clips.push({ ...snapshot.clips[0], id: randomUUID(), startMs: 8000, sourceAudioMuted: false });
  assert.deepEqual(snapTimelineClip(snapshot, 'video', id, 3900, 36, true), { startMs: 4000, guideMs: 8000 });
  assert.deepEqual(snapTimelineClip(snapshot, 'video', id, 8100, 36, true), { startMs: 8000, guideMs: 8000 });
  assert.equal(snapTimelineClip(snapshot, 'video', id, 6000, 36, true).guideMs, null);
  assert.equal(snapTimelineClip(snapshot, 'video', id, 3900, 36, false).guideMs, null);
  assert.equal(snapTimelineClip(snapshot, 'video', id, 3900, 120, true).guideMs, null);
});
test('OTIO roundtrip retains gaps, mute and links with remapped clip IDs', () => {
  const snapshot = pair(), moved = moveLinkedTimelineClip(snapshot, 'video', snapshot.clips[0].id, 'primary', 2000);
  const bindings = Object.fromEntries([...moved.clips.map((clip) => [ `asset://${clip.assetId}`, { assetId: clip.assetId, kind: clip.kind }]), ...moved.audioClips!.map((clip) => [`asset://${clip.assetId}`, { assetId: clip.assetId, kind: 'audio' as const }])]);
  const imported = importTimelineOtio(exportTimelineOtio('Linked', moved), bindings, randomUUID);
  assert.equal(imported.clips[0].startMs, 2000); assert.equal(imported.clips[0].trackId, undefined);
  assert.equal(imported.clips[0].sourceAudioMuted, true); assert.equal(imported.audioClips![0].linkedVideoClipId, imported.clips[0].id);
  assert.equal(imported.audioClips![0].allowSilentTail, true);
});

test('short extracted audio keeps the full video range through split/unlink, with explicit trailing silence only for audio', () => {
  const value = pair(), video = value.clips[0], audio = value.audioClips![0];
  const assets = [{ id: video.assetId, kind: 'video', metadata: { video: { durationSeconds: 5 } } },
    { id: audio.assetId, kind: 'audio', metadata: { audio: { durationSeconds: 2 } } }];
  assert.doesNotThrow(() => assertAssetRequirements(timelineAssetRequirements(value), assets));
  const split = splitTimelineClip(value, 'video', video.id, 3000, randomUUID);
  assert.equal(split.audioClips![1].sourceInMs, 4000, 'a cut after the sound ended remains a silent linked fragment');
  assert.doesNotThrow(() => assertAssetRequirements(timelineAssetRequirements(split), assets));
  assert.doesNotThrow(() => assertAssetRequirements(timelineAssetRequirements(unlinkTimelineClip(value, 'video', video.id)), assets));
  assert.throws(() => assertAssetRequirements([{ id: audio.assetId, kind: 'audio', endMs: 5000 }], assets), /Диапазон/);
  assert.throws(() => assertAssetRequirements([{ id: video.assetId, kind: 'video', endMs: 6000, allowSilentTail: true }], assets), /Диапазон/);
  assert.throws(() => assertAssetRequirements(timelineAssetRequirements(value), assets.slice(0, 1)), /недоступен/);
});
