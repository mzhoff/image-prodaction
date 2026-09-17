import type { UsageDashboardRow, UsageMeasures, UsagePeriod } from '../contracts/usage-dashboard';

const DAY = 86_400_000;
export function usagePeriod(from: string | null, to: string | null, timezone = 'Europe/Moscow', now = new Date()): UsagePeriod {
  if (timezone !== 'Europe/Moscow' && timezone !== 'UTC') throw new Error('Выберите UTC или Europe/Moscow.');
  const offset = timezone === 'Europe/Moscow' ? 3 * 3_600_000 : 0;
  const today = new Date(now.getTime() + offset).toISOString().slice(0, 10);
  const endDay = to ?? today;
  const startDay = from ?? new Date(Date.parse(`${today}T00:00:00Z`) - 29 * DAY).toISOString().slice(0, 10);
  const date = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Дата должна иметь формат YYYY-MM-DD.');
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) throw new Error('Некорректная дата.');
    return parsed;
  };
  const start = date(startDay), end = date(endDay) + DAY;
  if (end <= start || end - start > 366 * DAY) throw new Error('Выберите период от 1 до 366 дней.');
  return { from: startDay, to: endDay, timezone, start: new Date(start - offset).toISOString(), end: new Date(end - offset).toISOString() };
}

export function usageDays(period: UsagePeriod) {
  const days: string[] = [];
  for (let t = Date.parse(`${period.from}T00:00:00Z`); t <= Date.parse(`${period.to}T00:00:00Z`); t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

export function emptyUsage(): UsageMeasures {
  return { requests: 0, succeeded: 0, failed: 0, unconfirmed: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null,
    unknownCostRequests: 0, unknownTokenRequests: 0, images: 0, texts: 0, audio: 0, video: 0 };
}

/** Exact decimal accounting; conversion to Number belongs only to chart geometry. */
export function sumUsage(rows: readonly UsageMeasures[]): UsageMeasures {
  const result = emptyUsage();
  for (const row of rows) {
    for (const field of ['requests', 'succeeded', 'failed', 'unconfirmed', 'unknownCostRequests', 'unknownTokenRequests', 'images', 'texts', 'audio', 'video'] as const) result[field] += row[field];
    for (const field of ['inputTokens', 'outputTokens', 'totalTokens', 'costUsd'] as const) {
      if (row[field] === null) continue;
      result[field] = addDecimal(result[field] ?? '0', row[field], field === 'costUsd' ? 8 : 0);
    }
  }
  if (!result.requests) for (const field of ['inputTokens', 'outputTokens', 'totalTokens', 'costUsd'] as const) result[field] ??= '0';
  return result;
}
function addDecimal(a: string, b: string, precision: number) {
  const scale = BigInt(10) ** BigInt(precision);
  const units = (value: string) => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * scale + BigInt(fraction.padEnd(precision, '0').slice(0, precision) || '0'); };
  const total = units(a) + units(b);
  return precision ? `${total / scale}.${String(total % scale).padStart(precision, '0')}` : String(total);
}
export function groupUsage(rows: readonly UsageDashboardRow[], key: (row: UsageDashboardRow) => string) {
  const groups = new Map<string, UsageDashboardRow[]>();
  for (const row of rows) { const id = key(row); const group = groups.get(id) ?? []; group.push(row); groups.set(id, group); }
  return [...groups].map(([id, values]) => ({ id, ...sumUsage(values) }));
}
