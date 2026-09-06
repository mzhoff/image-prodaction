export class AssetRangeError extends Error {
  readonly total: number;
  constructor(total: number) { super('The requested byte range is invalid.'); this.total = total; this.name = 'AssetRangeError'; }
}
export function parseAssetByteRange(header: string | undefined, total: number) {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(total) || total < 1) throw new AssetRangeError(total);
  const suffix = !match[1];
  const first = Number(suffix ? match[2] : match[1]);
  const last = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || (suffix && first < 1)) throw new AssetRangeError(total);
  const start = suffix ? Math.max(0, total - first) : first;
  const end = suffix ? total - 1 : Math.min(last, total - 1);
  if (start < 0 || start >= total || end < start) throw new AssetRangeError(total);
  return { start, end, total };
}
