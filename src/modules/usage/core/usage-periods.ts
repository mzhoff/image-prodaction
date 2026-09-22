import type { UsageComparisonWindow, UsagePeriod, UsagePreset } from '../contracts/usage-dashboard';
import { usagePeriod } from './usage-dashboard';

const DAY = 86_400_000;
export function shiftUsageDay(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
function shiftMonths(day: string, months: number) {
  const date = new Date(`${day}T00:00:00Z`), wantedDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(wantedDay, last));
  return date.toISOString().slice(0, 10);
}

/** Rolling windows include today; Yesterday remains a single completed day. */
export function usagePresetPeriod(preset: Exclude<UsagePreset, 'custom'>, timezone = 'Europe/Moscow', now = new Date()) {
  const today = usagePeriod(null, null, timezone, now).to;
  const yesterday = shiftUsageDay(today, -1);
  if (preset === 'today') return usagePeriod(today, today, timezone, now);
  const from = preset === 'yesterday' ? yesterday : preset === 'week' ? shiftUsageDay(today, -6)
    : shiftMonths(today, preset === 'month' ? -1 : -3);
  return usagePeriod(from, preset === 'yesterday' ? yesterday : today, timezone, now);
}

/** Shift by the exact number of selected calendar days, with the same elapsed cutoff. */
export function usageComparisonWindow(period: UsagePeriod, now = new Date()): UsageComparisonWindow {
  const start = Date.parse(period.start), end = Date.parse(period.end);
  const days = (end - start) / DAY;
  const previous = usagePeriod(shiftUsageDay(period.from, -days), shiftUsageDay(period.from, -1), period.timezone);
  const through = Math.max(start, Math.min(end, now.getTime()));
  return { period: previous, currentThrough: new Date(through).toISOString(),
    previousThrough: new Date(through - days * DAY).toISOString(), partial: through < end, available: through > start };
}

export type UsageChange = { kind: 'percent'; basisPoints: string } | { kind: 'new' | 'empty' | 'unknown' };
/** Rounded percentage in hundredths, without floating-point arithmetic or division by zero. */
export function usageChange(current: string | number | null, previous: string | number | null, complete = true): UsageChange {
  if (!complete || current === null || previous === null) return { kind: 'unknown' };
  const units = (value: string | number) => {
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(whole!) * BigInt(100_000_000) + BigInt(fraction.padEnd(8, '0').slice(0, 8));
  };
  const before = units(previous), after = units(current);
  const zero = BigInt(0);
  if (before === zero) return { kind: after === zero ? 'empty' : 'new' };
  const difference = after - before;
  const absolute = (difference < zero ? -difference : difference) * BigInt(10_000);
  const rounded = (absolute + before / BigInt(2)) / before;
  return { kind: 'percent', basisPoints: String(difference < zero ? -rounded : rounded) };
}
