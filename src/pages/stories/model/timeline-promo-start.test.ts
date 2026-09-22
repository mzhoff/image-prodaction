import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { timelineSnapshotSchema } from '@/modules/story-projects/contracts/story-timeline';
import { newStoryDocument, newTimelineDocument } from './new-document';
import { promoParameters, timelineWithMusic } from './timeline-promo-start';
import { storySnapshotSchema } from '@/modules/story-projects/contracts/story-project';
import { sameTimeline } from './timeline-local-draft';
import { sameDocumentContent } from './document-content';

test('fresh story and timeline seeds contain no user content and preserve the selected project', () => {
  const workspace = randomUUID(), folder = randomUUID(), story = newStoryDocument(workspace, folder), timeline = newTimelineDocument(workspace, folder, story.id);
  assert.equal(story.folderId, folder); assert.equal(story.snapshot.blueprint.script, ''); assert.equal(story.snapshot.scenes.length, 0);
  assert.equal(timeline.storyboardId, story.id); assert.equal(timeline.folderId, folder); assert.equal(timeline.snapshot.clips.length, 0);
  assert.ok(storySnapshotSchema.safeParse(story.snapshot).success); assert.ok(timelineSnapshotSchema.safeParse(timeline.snapshot).success);
});
test('uploading music prepares the soundtrack without inventing video clips or losing source settings', () => {
  const draft = newTimelineDocument(randomUUID(), null, null, true), asset = { id: randomUUID(), audio: { durationSeconds: 21.25 } };
  const snapshot = timelineWithMusic(draft.snapshot, asset);
  assert.equal(snapshot.production?.targetDurationMs, 21250); assert.equal(snapshot.audioClips?.[0].durationMs, 21250); assert.equal(snapshot.clips.length, 0);
  assert.ok(timelineSnapshotSchema.safeParse(snapshot).success);
  assert.equal(JSON.parse(promoParameters(snapshot, asset.id)).musicId, asset.id);
  const replaced = timelineWithMusic(snapshot, { id: randomUUID(), audio: { durationSeconds: 300 } });
  assert.equal(replaced.audioClips?.length, 1); assert.equal(replaced.production?.targetDurationMs, 180000);
  assert.throws(() => timelineWithMusic(snapshot, { id: randomUUID(), audio: { durationSeconds: 2 } }), /5 секунд/);
});
test('server normalization of document keys does not create a false save conflict', () => {
  const timeline = newTimelineDocument(randomUUID(), null, null, true), story = newStoryDocument(randomUUID());
  const saved = { ...timeline, revision: 1, snapshot: timelineSnapshotSchema.parse(timeline.snapshot) };
  assert.equal(sameTimeline(timeline, saved), true);
  assert.equal(sameTimeline(timeline, { ...saved, name: 'Another montage' }), false);
  assert.equal(sameDocumentContent(story.snapshot, storySnapshotSchema.parse(story.snapshot)), true);
  assert.equal(sameDocumentContent({ clips: [1, 2] }, { clips: [2, 1] }), false);
});
