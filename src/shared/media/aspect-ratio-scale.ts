/** One common scale for image and video. Missing model choices keep their positions. */
export const ASPECT_RATIO_SCALE = [
  '1:8', '1:4', '9:21', '9:20', '9:19.5', '1:2', '9:16', '2:3', '3:4', '4:5',
  '1:1', '5:4', '4:3', '3:2', '16:9', '2:1', '19.5:9', '20:9', '21:9', '4:1', '8:1',
] as const;

export function parseAspectRatio(value: string): number | undefined {
  if (!/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value)) return undefined;
  const [width, height] = value.split(':').map(Number);
  const ratio = width / height;
  return width > 0 && height > 0 && Number.isFinite(ratio) ? ratio : undefined;
}

export function createAspectRatioScale(catalogRatios: readonly string[] = []): string[] {
  return [...new Set<string>([...ASPECT_RATIO_SCALE, ...catalogRatios])]
    .filter((ratio) => parseAspectRatio(ratio) !== undefined)
    .sort((a, b) => parseAspectRatio(a)! - parseAspectRatio(b)! || a.localeCompare(b));
}

export function nearestAvailableRatio(scale: readonly string[], available: readonly string[], fraction: number): string | undefined {
  const choices = new Set(available);
  const point = Math.max(0, Math.min(1, fraction)) * (scale.length - 1);
  return scale.reduce<string | undefined>((nearest, value, index) => {
    if (!choices.has(value)) return nearest;
    return nearest === undefined || Math.abs(index - point) < Math.abs(scale.indexOf(nearest) - point) ? value : nearest;
  }, undefined);
}
