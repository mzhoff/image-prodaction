import type { CropRect } from './types';

/** An absent frame means the full source; malformed saved frames never validate a result. */
export function getCropVideoSignature(sourceAssetId: string, crop?: CropRect): string | undefined {
  const frame = crop ?? { x: 0, y: 0, width: 1, height: 1 };
  if (!sourceAssetId || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)
    || frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0
    || frame.x + frame.width > 1 + 1e-9 || frame.y + frame.height > 1 + 1e-9) return undefined;
  return JSON.stringify(['video-crop-v1', sourceAssetId, frame.x, frame.y, frame.width, frame.height]);
}
