import { parseAspectRatio } from '../aspect-ratio-scale';
import { knownResolution, unknownResolution, type OutputResolution, type PixelSize } from './types';

const SOURCE = 'https://openrouter.ai/api/v1/videos/models';
/** Seedance 2.5 uses an area budget, unlike the short-side convention of other video models. */
const SEEDANCE_25: Record<string, Record<string, string>> = {
  '480p': { '16:9': '854x480', '4:3': '752x560', '1:1': '640x640', '3:4': '560x752', '9:16': '480x854', '21:9': '992x432' },
  '720p': { '16:9': '1280x720', '4:3': '1112x834', '1:1': '960x960', '3:4': '834x1112', '9:16': '720x1280', '21:9': '1470x630' },
};
function parseSize(size: string): PixelSize | undefined {
  if (!/^\d+x\d+$/.test(size)) return undefined;
  const [width, height] = size.split('x').map(Number);
  return width > 0 && height > 0 && width <= 32768 && height <= 32768 ? [width, height] : undefined;
}

export function getVideoOutputResolution(model: { key: string; supportedSizes?: readonly string[] }, ratio: string, resolution: string): OutputResolution {
  const sizes = model.supportedSizes ?? [];
  if (model.key === 'bytedance/seedance-2.5') {
    const value = SEEDANCE_25[resolution]?.[ratio];
    const pixels = value && sizes.includes(value) ? parseSize(value) : undefined;
    return pixels ? knownResolution(pixels, SOURCE) : unknownResolution(resolution);
  }
  const aspect = parseAspectRatio(ratio);
  const shortSide = /^\d+p$/.test(resolution) ? Number.parseInt(resolution, 10) : resolution === '4K' ? 2160 : undefined;
  if (aspect === undefined || !shortSide) return unknownResolution(resolution);
  // Only expose a published size; tolerate codec rounding such as 854x480 for 16:9.
  const candidates = sizes.map(parseSize).filter((pixels): pixels is PixelSize => pixels !== undefined
    && Math.min(...pixels) === shortSide && Math.abs(pixels[0] / pixels[1] / aspect - 1) < 0.015);
  return candidates.length === 1 ? knownResolution(candidates[0], SOURCE) : unknownResolution(resolution);
}
