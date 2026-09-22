import assert from 'node:assert/strict';
import test from 'node:test';
import { averageUsageCost, emptyUsage, groupUsage, sumUsage, usageDays, usagePeriod } from './usage-dashboard';
import type { UsageDashboardRow } from '../contracts/usage-dashboard';

test('calendar periods include both dates, respect Moscow midnight and fill empty days', () => {
  const now = new Date('2026-09-11T22:00:00Z');
  const moscow = usagePeriod(null, null, 'Europe/Moscow', now);
  assert.equal(moscow.from, '2026-08-14');
  assert.equal(moscow.to, '2026-09-12');
  assert.equal(moscow.start, '2026-08-13T21:00:00.000Z');
  assert.equal(moscow.end, '2026-09-12T21:00:00.000Z');
  assert.equal(usageDays(moscow).length, 30);
  assert.equal(usagePeriod(null, null, 'UTC', now).to, '2026-09-11');
  assert.deepEqual(usageDays(usagePeriod('2024-02-28', '2024-03-01', 'UTC')), ['2024-02-28', '2024-02-29', '2024-03-01']);
});

test('period validation rejects impossible dates, injection, reversed and oversized ranges', () => {
  for (const from of ['2026-02-29', '2026-13-01', '2026-1-01', '', "2026-01-01' OR 1=1"]) {
    assert.throws(() => usagePeriod(from, '2026-03-01'));
  }
  assert.throws(() => usagePeriod('2026-09-12', '2026-09-11'));
  assert.throws(() => usagePeriod('2024-01-01', '2025-01-01'));
  assert.throws(() => usagePeriod(null, null, 'Invalid/Timezone'));
  assert.equal(usageDays(usagePeriod('2024-01-01', '2024-12-31')).length, 366);
  assert.equal(usageDays(usagePeriod('2026-09-12', '2026-09-12')).length, 1);
});

test('exact decimals and large token counts reconcile without turning missing usage into zero', () => {
  const rows: UsageDashboardRow[] = [
    { ...emptyUsage(), day: '2026-09-11', provider: 'p', modelId: 'm', category: 'image', requests: 1, succeeded: 1,
      costUsd: '0.10000001', totalTokens: '9007199254740993', images: 1 },
    { ...emptyUsage(), day: '2026-09-12', provider: 'p', modelId: 'm', category: 'image', requests: 1, failed: 1,
      costUsd: '0.20000002', totalTokens: '2' },
    { ...emptyUsage(), day: '2026-09-12', provider: 'q', modelId: 'n', category: 'video', requests: 1, unconfirmed: 1,
      unknownCostRequests: 1, unknownTokenRequests: 1 },
  ];
  const total = sumUsage(rows);
  assert.equal(total.costUsd, '0.30000003');
  assert.equal(total.totalTokens, '9007199254740995');
  assert.equal(total.requests, 3);
  assert.equal(total.requests, total.succeeded + total.failed + total.unconfirmed);
  assert.equal(total.unknownCostRequests, 1);
  assert.equal(total.inputTokens, null);
  for (const key of [(r: UsageDashboardRow) => r.day, (r: UsageDashboardRow) => r.modelId, (r: UsageDashboardRow) => r.category]) {
    assert.deepEqual(sumUsage(groupUsage(rows, key)), total);
  }
  assert.equal(sumUsage([rows[2]!]).costUsd, null);
  assert.equal(sumUsage([]).costUsd, '0');
  assert.equal(sumUsage([{ ...emptyUsage(), images: 1 }]).requests, 0);
});


test('average cost divides the filtered total by all physical requests without floating point loss', () => {
  const average = (costUsd: string | null, requests: number, unknownCostRequests = 0) => averageUsageCost({ costUsd, requests, unknownCostRequests });
  assert.equal(average('1.50000000', 6), '0.250000000000');
  assert.equal(average('0.25000000', 4), '0.062500000000');
  assert.equal(average('1', 3), '0.333333333333');
  assert.equal(average('2', 3), '0.666666666667');
  assert.equal(average('0.00000001', 3), '0.000000003333');
  assert.equal(average('9007199254740993.00000001', 1), '9007199254740993.000000010000');
  assert.equal(average('0', 2), '0.000000000000');
  assert.equal(average('0', 0), null);
  assert.equal(average(null, 2, 2), null);
  assert.equal(average('3', 3, 1), null);
});
