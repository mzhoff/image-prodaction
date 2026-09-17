import type { UsageDashboardRow, UsageGrain, UsagePeriod } from '../contracts/usage-dashboard';
import { groupUsage, sumUsage, usageDays } from './usage-dashboard';
import { shiftUsageDay } from './usage-periods';

export const USAGE_OTHER_MODEL = '__usage_other_models';
export function buildUsageChart(rows: UsageDashboardRow[], period: UsagePeriod, grain: UsageGrain) {
  // Stable series/colors across cost/request and line/bar switches.
  const leaders = groupUsage(rows, (r) => r.modelId).sort((a, b) => b.requests - a.requests || a.id.localeCompare(b.id)).slice(0, 5).map((r) => r.id);
  const series = [...leaders, ...(rows.some((r) => !leaders.includes(r.modelId)) ? [USAGE_OTHER_MODEL] : [])];
  const bucketKey = (day: string) => grain === 'month' ? day.slice(0, 7) : grain === 'week'
    ? shiftUsageDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7)) : day;
  const buckets = new Map<string, { from: string; to: string; rows: UsageDashboardRow[] }>();
  for (const day of usageDays(period)) {
    const key = bucketKey(day), bucket = buckets.get(key);
    if (bucket) bucket.to = day;
    else buckets.set(key, { from: day, to: day, rows: [] });
  }
  for (const row of rows) buckets.get(bucketKey(row.day))?.rows.push(row);
  const points = [...buckets].map(([id, bucket]) => ({ id, from: bucket.from, to: bucket.to,
    total: sumUsage(bucket.rows), values: series.map((model) => sumUsage(bucket.rows.filter((r) => model === USAGE_OTHER_MODEL ? !leaders.includes(r.modelId) : r.modelId === model))) }));
  return { series, points };
}

/** Unknown values break the path instead of being rendered as zero. */
export function usageLinePath(values: (number | null)[], x: (index: number) => number, y: (value: number) => number) {
  let connected = false;
  return values.map((value, index) => {
    if (value === null) { connected = false; return ''; }
    const command = connected ? 'L' : 'M'; connected = true;
    return `${command}${x(index).toFixed(2)},${y(value).toFixed(2)}`;
  }).join(' ');
}

export function usageChartMax(value: number, integral: boolean) {
  if (!value) return integral ? 4 : 1;
  const rawStep = value / 4, magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= rawStep)! * magnitude;
  return (integral ? Math.max(1, Math.ceil(step)) : step) * 4;
}
