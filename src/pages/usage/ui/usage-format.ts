export function usageNumber(value: string | number | null, locale = 'ru-RU') {
  if (value === null) return '—';
  return new Intl.NumberFormat(locale).format(typeof value === 'string' ? BigInt(value) : value);
}
export function usageMoney(value: string | null, locale = 'ru-RU') {
  return value === null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value));
}
export function usageDate(day: string, locale = 'ru-RU') {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}
export function usageRangeLabel(from: string, to: string, locale = 'ru-RU') {
  const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC',
    ...(from.slice(0, 4) !== to.slice(0, 4) ? { year: 'numeric' as const } : {}) });
  return format.formatRange(new Date(`${from}T12:00:00Z`), new Date(`${to}T12:00:00Z`));
}
export function usageAverageMoney(value: string | null, locale = 'ru-RU') {
  if (value === null) return '—';
  const amount = Number(value);
  if (amount > 0 && amount < .00000001) return '< $0.00000001';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(amount);
}
