import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarMonthCells, calendarMonthRange, calendarRangeDays, calendarRangeError, orderedCalendarRange, shiftCalendarDay, shiftCalendarMonth } from './date-range-calendar-model';

test('calendar lays out leap February from Monday, without dates from adjacent months', () => {
  const cells = calendarMonthCells('2024-02-01');
  assert.equal(cells.length, 42);
  assert.deepEqual(cells.slice(0, 4), [null, null, null, '2024-02-01']);
  assert.equal(cells.filter(Boolean).length, 29);
  assert.equal(cells[31], '2024-02-29');
  assert.equal(cells[32], null);
});
test('month selection uses the full historical month and clips the current one at today', () => {
  assert.deepEqual(calendarMonthRange('2026-08-01', '2026-09-21'), { from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual(calendarMonthRange('2026-09-01', '2026-09-21'), { from: '2026-09-01', to: '2026-09-21' });
});
test('reverse selection, single days and cross-year ranges remain inclusive', () => {
  assert.deepEqual(orderedCalendarRange('2026-09-21', '2026-09-15'), { from: '2026-09-15', to: '2026-09-21' });
  assert.equal(calendarRangeDays(orderedCalendarRange('2026-09-21', '2026-09-15')), 7);
  assert.equal(calendarRangeDays({ from: '2026-09-21', to: '2026-09-21' }), 1);
  assert.equal(calendarRangeDays({ from: '2025-12-31', to: '2026-01-01' }), 2);
});
test('month and keyboard navigation handle leap dates, year boundaries and UTC days', () => {
  assert.equal(shiftCalendarMonth('2024-03-31', -1), '2024-02-29');
  assert.equal(shiftCalendarMonth('2026-01-01', -1), '2025-12-01');
  assert.equal(shiftCalendarDay('2026-03-29', 1), '2026-03-30');
});
test('validation rejects impossible, reversed, future and oversized selections', () => {
  const check = (from: string, to: string) => calendarRangeError({ from, to }, '2026-09-21', 366);
  assert.ok(check('2026-02-30', '2026-03-01'));
  assert.ok(check('', '2026-03-01'));
  assert.ok(check('2026-09-21', '2026-09-20'));
  assert.ok(check('2026-09-21', '2026-09-22'));
  assert.ok(check('2025-09-20', '2026-09-21'));
  assert.equal(check('2025-09-21', '2026-09-21'), null);
});
