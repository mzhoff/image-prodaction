import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateRemainingTime, formatRemainingTime } from './process-indicator-values';

test('remaining time stays unknown until work has been measured', () => {
  assert.equal(estimateRemainingTime(2000, 0, 10), undefined);
  assert.equal(estimateRemainingTime(undefined, 2, 10), undefined);
  assert.equal(estimateRemainingTime(2000, 10, 10), undefined);
  assert.equal(estimateRemainingTime(2000, 2, 10), 8000);
  assert.equal(formatRemainingTime(null), undefined);
  assert.equal(formatRemainingTime(Infinity), undefined);
  assert.equal(formatRemainingTime(-1), undefined);
  assert.equal(formatRemainingTime(8100), 'Осталось примерно 9 с');
  assert.equal(formatRemainingTime(61000), 'Осталось примерно 2 мин');
});
