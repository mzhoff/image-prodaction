import assert from 'node:assert/strict';
import test from 'node:test';
import { getTimelineOutputShots } from './timeline-output';
import type { TimelineAnalysis } from './timeline-contracts';

test('output selection wraps exactly like preview navigation for restored and negative indices', () => {
  const analysis = { shots: Array.from({ length: 5 }, (_, id) => ({ id: String(id) })) } as TimelineAnalysis;
  assert.equal(getTimelineOutputShots(analysis, 'selected', 8)[0]?.id, '3');
  assert.equal(getTimelineOutputShots(analysis, 'selected', -1)[0]?.id, '4');
  assert.equal(getTimelineOutputShots(analysis, 'selected', NaN)[0]?.id, '0');
  assert.equal(getTimelineOutputShots(analysis, 'all', 8), analysis.shots);
});
