/** USD uses integer 10^-8 units; never round or add currency using JS floats. */
export function usdUnits(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(value)) {
    throw new Error('USD must be a non-negative decimal string with at most eight fractional digits.');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100_000_000) + BigInt(fraction.padEnd(8, '0'));
}

export function formatUsd(value: bigint): string {
  if (value < BigInt(0)) throw new Error('USD cannot be negative.');
  return `${value / BigInt(100_000_000)}.${String(value % BigInt(100_000_000)).padStart(8, '0')}`;
}

export function sumUsd(values: readonly string[]): string {
  return formatUsd(values.reduce((sum, value) => sum + usdUnits(value), BigInt(0)));
}

export function strictestUsdLimit(...values: Array<string | null | undefined>): string | null {
  const limits = values.filter((value): value is string => value != null).map(usdUnits);
  return limits.length ? formatUsd(limits.reduce((min, value) => value < min ? value : min)) : null;
}
