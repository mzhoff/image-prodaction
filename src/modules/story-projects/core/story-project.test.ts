import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { storySnapshotSchema, storySaveSchema, type StoryClip } from '../contracts/story-project';
import { emptyTimeline, timelineSnapshotSchema } from '../contracts/story-timeline';
import { createStorySnapshot, settingsForFormat } from './story-presets';
import { clipAssetRequirements, removeStoryScene, removeStoryShot, reorderStoryClips, timelinePositions } from './story-editing';
import { assertAssetRequirements, assertStoryAssets } from '../server/story-service';
function fixture() {
  const story = createStorySnapshot(settingsForFormat('shorts'));
  const shot = { id: randomUUID(), description: 'Описание', durationMs: 3000, imageAssetId: null, videoAssetId: randomUUID() };
  story.scenes.push({ id: randomUUID(), title: 'Сцена', description: 'Контекст', shots: [shot] });
  const clip: StoryClip = { id: randomUUID(), assetId: shot.videoAssetId, shotId: shot.id, kind: 'video', sourceInMs: 1000, durationMs: 3000 };
  return { story, clip };
}
test('story character selection is optional for old documents and bounded for new ones', () => {
  const snapshot = createStorySnapshot(settingsForFormat('free'));
  assert.equal(storySnapshotSchema.safeParse(snapshot).success, true);
  const id = randomUUID();
  assert.equal(storySnapshotSchema.safeParse({ ...snapshot, subjectIds: [id] }).success, true);
  assert.equal(storySnapshotSchema.safeParse({ ...snapshot, subjectIds: [id, id] }).success, false);
  assert.equal(storySnapshotSchema.safeParse({ ...snapshot, subjectIds: Array.from({ length: 4 }, () => randomUUID()) }).success, false);
});
test('format defaults remain editable independently from genre', () => {
  const first = settingsForFormat('shorts'); const second = settingsForFormat('shorts');
  first.genre = 'comedy'; first.targetDurationSeconds = 45;
  assert.equal(second.genre, 'free'); assert.equal(second.targetDurationSeconds, 30);
  assert.equal(storySnapshotSchema.safeParse(createStorySnapshot(first)).success, true);
});
test('Storyboard v2 excludes montage and rejects duplicate shot/scene ids', () => {
  const { story } = fixture(); assert.equal(storySnapshotSchema.safeParse(story).success, true);
  assert.equal(storySnapshotSchema.safeParse({ ...story, timeline: { clips: [] } }).success, false);
  story.scenes.push(structuredClone(story.scenes[0])); assert.equal(storySnapshotSchema.safeParse(story).success, false);
});
test('Timeline is independent; source shot provenance survives removal from storyboard', () => {
  const { story, clip } = fixture(); const montage = { ...emptyTimeline(), clips: [clip] }; const original = structuredClone(montage);
  for (const changed of [removeStoryScene(story, story.scenes[0].id), removeStoryShot(story, clip.shotId!)]) assert.equal(storySnapshotSchema.safeParse(changed).success, true);
  assert.deepEqual(montage, original); assert.equal(timelineSnapshotSchema.safeParse(montage).success, true);
  assert.equal(timelineSnapshotSchema.safeParse({ ...montage, clips: [clip, clip] }).success, false);
  assert.equal(timelineSnapshotSchema.safeParse({ ...montage, clips: [{ ...clip, durationMs: -1 }] }).success, false);
  assert.equal(timelineSnapshotSchema.safeParse({ ...montage, clips: [{ ...clip, kind: 'image' }] }).success, false);
});
test('reorder retains trims and derives positions', () => {
  const { clip } = fixture(); const other = { ...clip, id: randomUUID(), durationMs: 5000 };
  const result = reorderStoryClips([clip, other], other.id, 0);
  assert.deepEqual(result.map((item) => item.id), [other.id, clip.id]); assert.deepEqual(timelinePositions(result).map((item) => item.startMs), [0, 5000]); assert.equal(result[1].sourceInMs, 1000);
});
test('both documents require accessible media; video range cannot exceed source', () => {
  const { story, clip } = fixture(); const asset = { id: clip.assetId, kind: 'video', metadata: { video: { durationSeconds: 4 } } };
  assert.doesNotThrow(() => assertStoryAssets(story, [asset])); assert.throws(() => assertStoryAssets(story, []), /Материал недоступен/);
  assert.doesNotThrow(() => assertAssetRequirements(clipAssetRequirements([clip]), [asset]));
  assert.throws(() => assertAssetRequirements(clipAssetRequirements([{ ...clip, sourceInMs: 1001 }]), [asset]), /Диапазон клипа/);
});
test('save requires revision and rejects injected ownership', () => {
  const request = { name: 'История', folderId: null, snapshot: fixture().story };
  assert.equal(storySaveSchema.safeParse(request).success, false); assert.equal(storySaveSchema.safeParse({ ...request, expectedRevision: 0 }).success, true);
  assert.equal(storySaveSchema.safeParse({ ...request, expectedRevision: 0, workspaceId: randomUUID() }).success, false);
});
