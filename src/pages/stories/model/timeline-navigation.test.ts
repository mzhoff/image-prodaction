import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { lastTimelineFrame, timelineFrameStep, timelineSceneStep, timelineSeekTime, timelineTimecode } from './timeline-navigation';

test('frame stepping remains precise at all supported frame rates and clamps to visible frames', () => {
  for (const fps of [24, 25, 30, 50, 60]) {
    let time = 0;
    for (let step = 0; step < fps; step++) time = timelineFrameStep(time, 1, 10_000, fps);
    assert.ok(Math.abs(time - 1000) < 1e-8);
    for (let step = 0; step < fps; step++) time = timelineFrameStep(time, -1, 10_000, fps);
    assert.equal(time, 0);
    assert.equal(timelineSeekTime(-300, 3000, fps), 0);
    const last = lastTimelineFrame(3000, fps);
    assert.ok(last < 3000);
    assert.equal(timelineSeekTime(5000, 3000, fps), last);
    assert.equal(timelineFrameStep(last, 1, 3000, fps), last);
  }
});
test('scene navigation goes to a preceding or following boundary, and never beyond the final frame', () => {
  const starts = [0, 1000, 2500];
  assert.equal(timelineSceneStep(500, 1, starts, 3000, 30), 1000);
  assert.equal(timelineSceneStep(1000, 1, starts, 3000, 30), 2500);
  assert.equal(timelineSceneStep(1700, -1, starts, 3000, 30), 1000);
  assert.equal(timelineSceneStep(1000, -1, starts, 3000, 30), 0);
  assert.equal(timelineSceneStep(2500, 1, starts, 3000, 30), lastTimelineFrame(3000, 30));
  assert.equal(timelineSceneStep(0, -1, [], 0, 30), 0);
  // A cut between output frames must land inside the next scene.
  assert.ok(timelineSceneStep(0, 1, [0, 1010], 3000, 30) >= 1010);
});
test('frame timecode does not accumulate millisecond rounding drift', () => {
  assert.equal(timelineTimecode(1000 / 30, 30), '00:00:00:01');
  assert.equal(timelineTimecode(60_000 - 1000 / 24, 24), '00:00:59:23');
  assert.equal(timelineTimecode(3_600_000, 30), '01:00:00:00');
  assert.equal(lastTimelineFrame(1001, 30), 1000);
});
