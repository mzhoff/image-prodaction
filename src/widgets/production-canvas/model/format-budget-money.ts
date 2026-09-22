export function formatBudgetMoney(value: number | string | null | undefined) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value);
  if (amount > 0 && amount < 0.0001) return '< $0.0001';
  return `$${amount.toFixed(amount !== 0 && Math.abs(amount) < 1 ? 4 : 2)}`;
}
