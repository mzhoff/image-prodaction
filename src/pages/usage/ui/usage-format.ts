export function usageNumber(value: string | number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('ru-RU').format(typeof value === 'string' ? BigInt(value) : value);
}
export function usageMoney(value: string | null) {
  return value === null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value));
}
export function usageDate(day: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}
export function usageRangeLabel(from: string, to: string) {
  const format = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC',
    ...(from.slice(0, 4) !== to.slice(0, 4) ? { year: 'numeric' as const } : {}) });
  return format.formatRange(new Date(`${from}T12:00:00Z`), new Date(`${to}T12:00:00Z`));
}
