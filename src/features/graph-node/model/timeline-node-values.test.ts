import assert from 'node:assert/strict';
import test from 'node:test';
import { timelineShotFingerprint, type TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { applyTimelineDescriptions, formatTimelineTime, limitTimelineDescription, nearestTimelineFrame, recoverTimelineResult, timelineDescriptionBaselines, timelineUndescribedShots, wrapTimelineShotIndex } from './timeline-node-values';

const timeline: TimelineAnalysis = { version: 1, sourceAssetId: '01900000-0000-7000-8000-000000000111', sourceChecksum: 'a'.repeat(64),
  durationMs: 1200, frameTimesMs: [0, 40, 80, 120, 200, 280, 400, 600, 840, 1000],
  shots: [{ id: 'first', startMs: 0, endMs: 400, frames: [{ timeMs: 120 }], description: '' },
    { id: 'second', startMs: 400, endMs: 1200, frames: [{ timeMs: 840 }], description: 'User text' }] };

test('descriptions merge only into unchanged source, selected frames and manual text', () => {
  const baselines = timelineDescriptionBaselines(timeline.shots);
  const result = { sourceAssetId: timeline.sourceAssetId, sourceChecksum: timeline.sourceChecksum,
    shots: timeline.shots.map((shot) => ({ id: shot.id, description: 'New description', describedFingerprint: timelineShotFingerprint(shot),
      frames: [{ timeMs: shot.frames[0]!.timeMs, assetId: '01900000-0000-7000-8000-000000000222' }] })) };
  const merged = applyTimelineDescriptions(timeline, result, baselines);
  assert.equal(merged.shots[0]!.description, 'New description');
  assert.equal(merged.shots[0]!.frames[0]!.assetId, result.shots[0]!.frames[0]!.assetId);
  assert.equal(timeline.shots[0]!.description, '');
  assert.equal(applyTimelineDescriptions(merged, result, baselines), merged);
  assert.equal(applyTimelineDescriptions(timeline, { ...result, sourceChecksum: 'b'.repeat(64) }, baselines), timeline);
  const edited = { ...timeline, shots: timeline.shots.map((shot) => ({ ...shot, description: 'A newer manual edit' })) };
  assert.equal(applyTimelineDescriptions(edited, result, baselines), edited);
  const reframed = { ...timeline, shots: timeline.shots.map((shot) => ({ ...shot, frames: [{ timeMs: shot.startMs }] })) };
  assert.equal(applyTimelineDescriptions(reframed, result, baselines), reframed);
});

test('remaining descriptions skip successful shots without hiding stale or manual text', () => {
  const completed = { ...timeline.shots[0]!, description: 'Done', describedFingerprint: timelineShotFingerprint(timeline.shots[0]!) };
  assert.deepEqual(timelineUndescribedShots([completed, timeline.shots[1]!]).map((shot) => shot.id), ['second']);
  assert.equal(timelineUndescribedShots([{ ...completed, endMs: 600 }]).length, 1);
});

test('finishing an unseen terminal result recovers paid partials before deciding what remains', () => {
  const shot = timeline.shots[0]!;
  const result = { sourceAssetId: timeline.sourceAssetId, sourceChecksum: timeline.sourceChecksum,
    shots: [{ id: shot.id, description: 'Already paid result', describedFingerprint: timelineShotFingerprint(shot) }] };
  const recovered = recoverTimelineResult(timeline, result, timeline.sourceAssetId, timelineDescriptionBaselines(timeline.shots))!;
  assert.equal(recovered.shots[0]!.description, 'Already paid result');
  assert.deepEqual(timelineUndescribedShots(recovered.shots).map((item) => item.id), ['second']);
  const manuallyEdited = { ...timeline, shots: [{ ...shot, description: 'New user text' }, timeline.shots[1]!] };
  assert.equal(recoverTimelineResult(manuallyEdited, result, timeline.sourceAssetId, timelineDescriptionBaselines(timeline.shots)), manuallyEdited);
  assert.equal(recoverTimelineResult(timeline, result, 'another-source', timelineDescriptionBaselines(timeline.shots)), timeline);
  assert.equal(recoverTimelineResult(undefined, timeline, timeline.sourceAssetId, []), timeline);
  assert.equal(recoverTimelineResult(undefined, timeline, 'another-source', []), undefined);
});

test('UI limits descriptions by Unicode characters and preserves actual variable frame timestamps', () => {
  assert.equal(Array.from(limitTimelineDescription('🎬'.repeat(1501))).length, 1500);
  assert.equal(limitTimelineDescription('🎬'.repeat(1501)).length, 3000);
  assert.equal(nearestTimelineFrame(timeline.frameTimesMs, 320, 0, 400), 280);
  assert.equal(nearestTimelineFrame(timeline.frameTimesMs, 1200, 400, 1200), 1000);
  assert.equal(formatTimelineTime(62_123.4), '01:02.123');
  assert.equal(wrapTimelineShotIndex(-1, 3), 2);
  assert.equal(wrapTimelineShotIndex(3, 3), 0);
  assert.equal(wrapTimelineShotIndex(0, 0), 0);
});
