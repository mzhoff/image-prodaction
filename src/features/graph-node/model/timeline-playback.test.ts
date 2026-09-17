import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { shotPlaybackFrames, timelineFrameAtPosition, timelineLoopTime, timelineSpaceAllowed } from './timeline-playback';

const analysis: TimelineAnalysis = { version: 1, sourceAssetId: '00000000-0000-4000-8000-000000000001', sourceChecksum: 'a'.repeat(64),
  durationMs: 1000, frameTimesMs: [0, 40, 120, 200, 350, 500, 700, 800], shots: [
    { id: 'left', startMs: 0, endMs: 350, frames: [{ timeMs: 120 }], description: '' },
    { id: 'right', startMs: 350, endMs: 1000, frames: [{ timeMs: 500 }], description: '' },
  ] };

test('playback and marker rail include only real VFR timestamps inside the selected shot', () => {
  const frames = shotPlaybackFrames(analysis, analysis.shots[1]!);
  assert.deepEqual(frames, [350, 500, 700, 800]);
  assert.equal(timelineFrameAtPosition(frames, 350, 1000, -0.2), 350);
  assert.equal(timelineFrameAtPosition(frames, 350, 1000, 1.2), 800);
  assert.equal(timelineFrameAtPosition(frames, 350, 1000, 0.5), 700);
  assert.equal(timelineFrameAtPosition(frames, 350, 1000, 0.2), 500);
  assert.deepEqual(shotPlaybackFrames(analysis, analysis.shots[0]!), [0, 40, 120, 200]);
});

test('loop stays inside a selected middle or final shot and restarts at its own start', () => {
  assert.equal(timelineLoopTime(350, 350, 1000), 350);
  assert.equal(timelineLoopTime(999.9, 350, 1000), 999.9);
  assert.equal(timelineLoopTime(1000, 350, 1000), 350);
  assert.equal(timelineLoopTime(1015, 350, 1000), 350);
  assert.equal(timelineLoopTime(0, 350, 1000), 350);
  assert.equal(timelineLoopTime(Number.NaN, 350, 1000), 350);
  assert.equal(timelineLoopTime(350, 0, 350), 0);
});

const space = { code: 'Space', repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false };
test('Space belongs only to the sole selected Timeline node and never steals typing or controls', () => {
  assert.equal(timelineSpaceAllowed(space, 'timeline', ['timeline'], false), true);
  assert.equal(timelineSpaceAllowed(space, 'timeline', ['other'], false), false);
  assert.equal(timelineSpaceAllowed(space, 'timeline', [], false), false);
  assert.equal(timelineSpaceAllowed(space, 'timeline', ['timeline', 'other'], false), false);
  assert.equal(timelineSpaceAllowed(space, undefined, ['timeline'], false), false);
  assert.equal(timelineSpaceAllowed(space, 'timeline', ['timeline'], true), false);
  for (const flag of ['repeat', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'defaultPrevented']) {
    assert.equal(timelineSpaceAllowed({ ...space, [flag]: true }, 'timeline', ['timeline'], false), false);
  }
  assert.equal(timelineSpaceAllowed({ ...space, code: 'Enter' }, 'timeline', ['timeline'], false), false);
});
