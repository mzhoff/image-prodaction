import assert from 'node:assert/strict';
import test from 'node:test';
import { timelineAnalysisSchema, timelineShotFingerprint, type TimelineAnalysis } from './timeline-contracts';
import { mergeTimelineShots, moveTimelineFrame, moveTimelineBoundary, nearestTimelineFrame, selectTimelineFrames, setTimelineShotStart, setTimelineShotEnd, splitTimelineShot, stepTimelineBoundary, stepTimelineFrame } from './timeline-editing';

const fixture = (): TimelineAnalysis => ({ version: 1, sourceAssetId: '00000000-0000-4000-8000-000000000001', sourceChecksum: 'a'.repeat(64),
  durationMs: 1000, frameTimesMs: [0, 40, 120, 200, 350, 500, 700, 800], shots: [
    { id: 'a', startMs: 0, endMs: 350, frames: [{ timeMs: 120, assetId: '00000000-0000-4000-8000-000000000002' }], description: 'Manual left.' },
    { id: 'b', startMs: 350, endMs: 1000, frames: [{ timeMs: 500 }], description: 'Manual right.' },
  ] });

test('VFR frame stepping uses real adjacent presentation timestamps in either direction', () => {
  const analysis = fixture();
  assert.equal(stepTimelineFrame(analysis, 200, 1), 350);
  assert.equal(stepTimelineFrame(analysis, 350, -1), 200);
  assert.equal(stepTimelineFrame(analysis, 0, -1), 0);
  assert.equal(stepTimelineFrame(analysis, 1000, 1), 800);
  assert.equal(nearestTimelineFrame(analysis.frameTimesMs, 118), 120);
  assert.throws(() => nearestTimelineFrame([], 0));
  assert.throws(() => nearestTimelineFrame([0], Number.NaN));
});

test('moving a shared cut never opens a gap; preserves selected assets, manual text and stale fingerprint', () => {
  const analysis = fixture(); const original = structuredClone(analysis);
  analysis.shots[0]!.describedFingerprint = timelineShotFingerprint(analysis.shots[0]!);
  const result = moveTimelineBoundary(analysis, 'a', 520);
  assert.equal(result.shots[0]!.endMs, 500); assert.equal(result.shots[1]!.startMs, 500);
  assert.equal(result.shots[0]!.description, 'Manual left.');
  assert.equal(result.shots[0]!.frames[0]!.assetId, original.shots[0]!.frames[0]!.assetId);
  assert.equal(result.shots[0]!.describedFingerprint, analysis.shots[0]!.describedFingerprint);
  assert.notEqual(timelineShotFingerprint(result.shots[0]!), result.shots[0]!.describedFingerprint);
  assert.equal(analysis.shots[0]!.endMs, 350); assert.equal(timelineAnalysisSchema.safeParse(result).success, true);
  assert.equal(stepTimelineBoundary(analysis, 'a', -1).shots[0]!.endMs, 200);
  const remapped = moveTimelineBoundary(analysis, 'a', 40);
  assert.deepEqual(remapped.shots[0]!.frames, [{ timeMs: 0 }]);
  assert.throws(() => moveTimelineBoundary(analysis, 'a', 0));
  assert.throws(() => moveTimelineBoundary(analysis, 'b', 500));
});

test('split and merge preserve a continuous source and stable existing IDs without losing descriptions', () => {
  const analysis = fixture(); const result = splitTimelineShot(analysis, 'a', 195, 'new');
  assert.equal(result.shots.length, 3); assert.equal(result.shots[0]!.id, 'a'); assert.equal(result.shots[1]!.id, 'new');
  assert.equal(result.shots[1]!.startMs, 200); assert.equal(result.shots[1]!.endMs, 350);
  assert.equal(result.shots[1]!.description, 'Manual left.');
  assert.equal(timelineAnalysisSchema.safeParse(result).success, true);
  assert.throws(() => splitTimelineShot(analysis, 'a', 0, 'new'));
  assert.throws(() => splitTimelineShot(analysis, 'a', 200, 'b'));
  const merged = mergeTimelineShots(analysis, 'a');
  assert.equal(merged.shots.length, 1); assert.equal(merged.shots[0]!.description, 'Manual left.\nManual right.');
  assert.equal(merged.shots[0]!.endMs, 1000); assert.equal(merged.shots[0]!.frames.length, 2);
  assert.equal(timelineAnalysisSchema.safeParse(merged).success, true);
  analysis.shots[0]!.description = 'a'.repeat(1500);
  assert.throws(() => mergeTimelineShots(analysis, 'a'), /1500/);
});

test('selected stills are distinct actual frames within their shot and retain old description provenance', () => {
  const analysis = fixture(); const shot = analysis.shots[0]!;
  shot.describedFingerprint = timelineShotFingerprint(shot);
  const result = selectTimelineFrames(analysis, 'a', [120, 199, 198]);
  assert.deepEqual(result.shots[0]!.frames.map((frame) => frame.timeMs), [120, 200]);
  assert.equal(result.shots[0]!.frames[0]!.assetId, shot.frames[0]!.assetId);
  assert.equal(result.shots[0]!.description, shot.description);
  assert.notEqual(timelineShotFingerprint(result.shots[0]!), result.shots[0]!.describedFingerprint);
  assert.throws(() => selectTimelineFrames(analysis, 'a', [350]));
  assert.throws(() => selectTimelineFrames(analysis, 'a', []));
  assert.throws(() => selectTimelineFrames(analysis, 'a', [0, 1, 2, 3, 4, 5]));
});

test('set start moves a shared boundary or creates a preceding shot while retaining selected identity', () => {
  const source = fixture();
  const moved = setTimelineShotStart(source, 'b', 200);
  assert.equal(moved.shots.length, 2);
  assert.equal(moved.shots[0]!.endMs, 200);
  assert.equal(moved.shots[1]!.startMs, 200);
  const created = setTimelineShotStart(source, 'a', 195, 'preceding');
  assert.deepEqual(created.shots.map((shot) => [shot.id, shot.startMs, shot.endMs]), [
    ['preceding', 0, 200], ['a', 200, 350], ['b', 350, 1000],
  ]);
  assert.equal(created.shots[1]!.description, source.shots[0]!.description);
  assert.equal(timelineAnalysisSchema.safeParse(created).success, true);
  assert.deepEqual(created.shots[1]!.frames, [{ timeMs: 200 }]);
  assert.equal(source.shots[0]!.startMs, 0);
  assert.equal(setTimelineShotStart(source, 'a', 0), source);
  assert.throws(() => setTimelineShotStart(source, 'a', 350, 'preceding'));
  assert.throws(() => setTimelineShotStart(source, 'a', 200, 'b'));
});

test('set end moves a shared boundary or creates a following shot with no gaps', () => {
  const source = fixture();
  const moved = setTimelineShotEnd(source, 'a', 520);
  assert.equal(moved.shots[0]!.endMs, 500);
  assert.equal(moved.shots[1]!.startMs, 500);
  const created = setTimelineShotEnd(source, 'b', 790, 'following');
  assert.deepEqual(created.shots.map((shot) => [shot.id, shot.startMs, shot.endMs]), [
    ['a', 0, 350], ['b', 350, 800], ['following', 800, 1000],
  ]);
  assert.equal(timelineAnalysisSchema.safeParse(created).success, true);
  assert.equal(setTimelineShotEnd(source, 'b', 1000), source);
  assert.throws(() => setTimelineShotEnd(source, 'b', 350, 'following'));
});

test('moving a frame snaps and sorts selected stills but never reuses the old file at its new time', () => {
  const source = fixture();
  const prepared = selectTimelineFrames(source, 'a', [0, 120]);
  const moved = moveTimelineFrame(prepared, 'a', 1, 198);
  assert.deepEqual(moved.shots[0]!.frames, [{ timeMs: 0 }, { timeMs: 200 }]);
  assert.equal(moved.shots[0]!.description, source.shots[0]!.description);
  const sorted = moveTimelineFrame(prepared, 'a', 0, 199);
  assert.deepEqual(sorted.shots[0]!.frames.map((frame) => frame.timeMs), [120, 200]);
  assert.equal(sorted.shots[0]!.frames[0]!.assetId, source.shots[0]!.frames[0]!.assetId);
  assert.equal(sorted.shots[0]!.frames[1]!.assetId, undefined);
  assert.throws(() => moveTimelineFrame(prepared, 'a', 9, 200));
  assert.throws(() => moveTimelineFrame(prepared, 'a', 0, 350));
});
