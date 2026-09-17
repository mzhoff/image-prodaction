import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUsageChart, usageChartMax, usageLinePath, USAGE_OTHER_MODEL } from './usage-chart';
import { emptyUsage, sumUsage, usagePeriod } from './usage-dashboard';
import type { UsageDashboardRow } from '../contracts/usage-dashboard';

const row = (day: string, modelId = 'model-a'): UsageDashboardRow => ({ ...emptyUsage(), day, modelId, provider: 'qa', category: 'image', requests: 1, images: 1, costUsd: '0.10000000', inputTokens: '5', outputTokens: '5', totalTokens: '10' });
test('all grains preserve exact totals and clip partial calendar weeks/months to selected dates', () => {
  const rows = [row('2026-08-30'), row('2026-08-31'), row('2026-09-02')];
  const period = usagePeriod('2026-08-30', '2026-09-02');
  const daily = buildUsageChart(rows, period, 'day');
  assert.equal(daily.points.length, 4);
  assert.equal(daily.points[2]!.total.costUsd, '0');
  const weekly = buildUsageChart(rows, period, 'week');
  assert.deepEqual(weekly.points.map((p) => [p.from, p.to]), [['2026-08-30', '2026-08-30'], ['2026-08-31', '2026-09-02']]);
  const monthly = buildUsageChart(rows, period, 'month');
  assert.deepEqual(monthly.points.map((p) => [p.from, p.to]), [['2026-08-30', '2026-08-31'], ['2026-09-01', '2026-09-02']]);
  for (const chart of [daily, weekly, monthly]) assert.deepEqual(sumUsage(chart.points.map((p) => p.total)), sumUsage(rows));
});

test('unknown costs remain null and extra models are combined without losing requests', () => {
  const rows = Array.from({ length: 7 }, (_, i) => row('2026-09-01', `model-${i}`));
  rows[0] = { ...rows[0]!, costUsd: null, unknownCostRequests: 1 };
  const chart = buildUsageChart(rows, usagePeriod('2026-09-01', '2026-09-02'), 'day');
  assert.equal(chart.series.length, 6);
  assert.equal(chart.series[5], USAGE_OTHER_MODEL);
  assert.equal(chart.points[0]!.values[0]!.costUsd, null);
  assert.equal(chart.points[0]!.values[5]!.requests, 2);
  assert.equal(chart.points[0]!.total.unknownCostRequests, 1);
});

test('line paths leave gaps at unknown values; axis always contains the maximum', () => {
  assert.equal(usageLinePath([0, 2, null, 3], (n) => n, (n) => n), 'M0.00,0.00 L1.00,2.00  M3.00,3.00');
  for (const n of [0, .00000001, .003, .01, .9, 1, 4.2, 999, 50000]) {
    assert.ok(usageChartMax(n, false) >= n);
    assert.ok(usageChartMax(n, true) >= n);
    assert.equal(usageChartMax(n, true) % 4, 0);
  }
});
