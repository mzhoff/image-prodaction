import assert from 'node:assert/strict';
import { test } from 'node:test';
import { usageNumber, usageMoney, usageDate, usageRangeLabel } from './usage-format';

test('analytics formats numbers and USD amounts in the selected language without conversion', () => {
  assert.equal(usageNumber('9007199254740993', 'en-US'), '9,007,199,254,740,993');
  assert.equal(usageNumber(null, 'en-US'), '—');
  assert.equal(usageMoney('1234.5', 'en-US'), '$1,234.50');
  assert.match(usageMoney('1234.5'), /1.*234,50/);
});
test('analytics changes date language without shifting the selected reporting days', () => {
  assert.equal(usageDate('2026-09-21', 'en-US'), 'Sep 21');
  assert.match(usageDate('2026-09-21'), /21.*сент/);
  assert.match(usageRangeLabel('2025-12-31', '2026-01-01', 'en-US'), /2025.*2026/);
});
