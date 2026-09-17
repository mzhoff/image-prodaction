import assert from 'node:assert/strict';
import test from 'node:test';
import { usageDays, usagePeriod } from './usage-dashboard';
import { usageChange, usageComparisonWindow, usagePresetPeriod } from './usage-periods';

test('presets use the requested timezone and completed rolling windows', () => {
  const now = new Date('2026-09-11T22:00:00Z');
  const cases = [['today', '2026-09-12', '2026-09-12'], ['yesterday', '2026-09-11', '2026-09-11'],
    ['week', '2026-09-05', '2026-09-11'], ['month', '2026-08-12', '2026-09-11'], ['quarter', '2026-06-12', '2026-09-11']] as const;
  for (const [preset, from, to] of cases) {
    const actual = usagePresetPeriod(preset, 'Europe/Moscow', now);
    assert.equal(actual.from, from); assert.equal(actual.to, to);
  }
  assert.equal(usagePresetPeriod('today', 'UTC', now).from, '2026-09-11');
});

test('month presets clamp end-of-month dates and handle leap days and year boundaries', () => {
  assert.equal(usagePresetPeriod('month', 'UTC', new Date('2024-03-31T12:00:00Z')).from, '2024-02-29');
  assert.equal(usagePresetPeriod('month', 'UTC', new Date('2025-03-31T12:00:00Z')).from, '2025-02-28');
  assert.equal(usagePresetPeriod('quarter', 'UTC', new Date('2026-01-12T12:00:00Z')).from, '2025-10-12');
});

test('previous period immediately precedes selected dates and has exactly the same number of days', () => {
  const now = new Date('2026-09-12T10:00:00Z');
  for (const preset of ['yesterday', 'week', 'month', 'quarter'] as const) {
    const period = usagePresetPeriod(preset, 'Europe/Moscow', now), comparison = usageComparisonWindow(period, now);
    assert.equal(usageDays(comparison.period).length, usageDays(period).length);
    assert.equal(comparison.period.end, period.start);
    assert.equal(comparison.currentThrough, period.end);
    assert.equal(comparison.previousThrough, comparison.period.end);
    assert.equal(comparison.partial, false);
  }
});

test('Today and custom unfinished windows compare the same elapsed duration, never a full previous day', () => {
  const now = new Date('2026-09-12T09:34:00Z');
  for (const period of [usagePresetPeriod('today', 'Europe/Moscow', now), usagePeriod('2026-09-01', '2026-09-30')]) {
    const comparison = usageComparisonWindow(period, now);
    assert.equal(comparison.currentThrough, now.toISOString());
    assert.equal(Date.parse(comparison.currentThrough) - Date.parse(period.start), Date.parse(comparison.previousThrough) - Date.parse(comparison.period.start));
    assert.equal(comparison.partial, true);
  }
  const today = usageComparisonWindow(usagePresetPeriod('today', 'Europe/Moscow', now), now);
  assert.equal(today.previousThrough, '2026-09-11T09:34:00.000Z');
  const future = usageComparisonWindow(usagePeriod('2027-01-01', '2027-01-31'), now);
  assert.equal(future.available, false);
  assert.equal(future.currentThrough, '2026-12-31T21:00:00.000Z');
  assert.equal(future.previousThrough, future.period.start);
});

test('percentage calculation is exact, rounded, and honest about unknown or zero baselines', () => {
  const percent = (current: string | number, previous: string | number, expected: string) => assert.deepEqual(usageChange(current, previous), { kind: 'percent', basisPoints: expected });
  percent(150, 100, '5000'); percent(50, 100, '-5000'); percent(0, 3, '-10000');
  percent(4, 3, '3333'); percent(2, 3, '-3333'); percent('0.30000000', '0.10000000', '20000');
  percent('0.00000002', '0.00000001', '10000'); percent('18014398509481986', '9007199254740993', '10000');
  percent(100, 100, '0');
  assert.deepEqual(usageChange(1, 0), { kind: 'new' });
  assert.deepEqual(usageChange(0, 0), { kind: 'empty' });
  assert.deepEqual(usageChange(null, 5), { kind: 'unknown' });
  assert.deepEqual(usageChange(5, null), { kind: 'unknown' });
  assert.deepEqual(usageChange(5, 10, false), { kind: 'unknown' });
});
