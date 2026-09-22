export interface CalendarRange { from: string; to: string }
const DAY = 86_400_000;
const parse = (day: string) => Date.parse(`${day}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

export function shiftCalendarDay(day: string, count: number) { return iso(new Date(parse(day) + count * DAY)); }
export function calendarMonthStart(day: string) { return `${day.slice(0, 7)}-01`; }
export function shiftCalendarMonth(day: string, count: number) {
  const date = new Date(parse(day)), wanted = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + count);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(wanted, last));
  return iso(date);
}
export function calendarMonthRange(month: string, maxDate: string): CalendarRange {
  const from = calendarMonthStart(month), last = shiftCalendarDay(shiftCalendarMonth(from, 1), -1);
  return { from, to: last < maxDate ? last : maxDate };
}
/** Six Monday-first rows keep the footer still while browsing months. */
export function calendarMonthCells(month: string): (string | null)[] {
  const first = calendarMonthStart(month), weekday = (new Date(parse(first)).getUTCDay() + 6) % 7;
  const last = shiftCalendarDay(shiftCalendarMonth(first, 1), -1);
  const count = new Date(parse(last)).getUTCDate();
  return Array.from({ length: 42 }, (_, index) => index < weekday || index >= weekday + count ? null : shiftCalendarDay(first, index - weekday));
}
export function orderedCalendarRange(a: string, b: string): CalendarRange { return a <= b ? { from: a, to: b } : { from: b, to: a }; }
export function calendarRangeDays(range: CalendarRange) { return Math.round((parse(range.to) - parse(range.from)) / DAY) + 1; }
export function calendarRangeError(range: CalendarRange, maxDate: string, maxDays: number): string | null {
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parse(day)) && iso(new Date(parse(day))) === day;
  if (!valid(range.from) || !valid(range.to)) return 'Укажите обе даты.';
  if (range.from > range.to) return 'Начало периода должно быть не позже конца.';
  if (range.to > maxDate) return 'Выберите даты не позднее сегодняшнего дня.';
  if (calendarRangeDays(range) > maxDays) return `Выберите период не длиннее ${maxDays} дней.`;
  return null;
}
