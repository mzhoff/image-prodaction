/** Quantize provider decimal strings to ledger precision without floating-point arithmetic. */
export function normalizeProviderCostUsd(value: string | null | undefined): string | null {
  if (value == null) return null;
  const match = /^(0|[1-9]\d{0,11})(?:\.(\d{1,40}))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = match[2] ?? '';
  let units = BigInt(match[1]) * BigInt(100_000_000) + BigInt(fraction.padEnd(8, '0').slice(0, 8));
  if (fraction.length > 8 && fraction[8] >= '5') units += BigInt(1);
  // A positive sub-precision charge must not be described as a free provider call.
  if (units === BigInt(0) && /[1-9]/.test(`${match[1]}${fraction}`)) return null;
  if (units >= BigInt('100000000000000000000')) return null;
  const decimal = `${units / BigInt(100_000_000)}.${String(units % BigInt(100_000_000)).padStart(8, '0')}`;
  return decimal.replace(/0+$/, '').replace(/\.$/, '');
}
