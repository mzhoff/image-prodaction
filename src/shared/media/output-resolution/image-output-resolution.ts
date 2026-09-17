import { GEMINI_25, GEMINI_3, GOOGLE_IMAGE_SOURCE, RECRAFT_IMAGE_SOURCE, RECRAFT_V3, RECRAFT_V4 } from './image-resolution-tables';
import { knownResolution, unknownResolution, type OutputResolution } from './types';

const geminiFlash = new Set(['google/gemini-3.1-flash-image', 'google/gemini-3.1-flash-image-preview']);
const geminiPro = new Set(['google/gemini-3-pro-image', 'google/gemini-3-pro-image-preview']);
const recraftV4 = new Set(['recraft/recraft-v4', 'recraft/recraft-v4.1', 'recraft/recraft-v4.1-utility', 'recraft/recraft-v4-styles']);
const recraftPro = new Set(['recraft/recraft-v4-pro', 'recraft/recraft-v4.1-pro', 'recraft/recraft-v4.1-utility-pro', 'recraft/recraft-v4-styles-pro']);

/** Local read only. Does not replace live capabilities or change the generation request. */
export function getImageOutputResolution(modelId: string, ratio: string, size: string): OutputResolution {
  if (ratio === 'auto') return unknownResolution(undefined, 'Автоматический формат и размер определит модель по запросу и референсам.');
  const tier = size === '0.5K' ? '512' : size;
  if (modelId === 'google/gemini-2.5-flash-image') {
    const pixels = ['auto', '1K'].includes(tier) ? GEMINI_25[ratio] : undefined;
    return pixels ? knownResolution(pixels, GOOGLE_IMAGE_SOURCE) : unknownResolution(size,
      'Для Nano Banana подтверждён только исходный размер около 1 мегапикселя. Этот уровень размера не имеет подтверждённой таблицы.');
  }
  const isFlash = geminiFlash.has(modelId), isPro = geminiPro.has(modelId);
  const isLite = modelId === 'google/gemini-3.1-flash-lite-image';
  if (isFlash || isPro || isLite) {
    const permitted = isFlash ? ['512', '1K', '2K', '4K'] : isLite ? ['1K'] : ['1K', '2K', '4K'];
    // Pro has no extreme panorama modes. The published Flash 512/21:9 row is internally inconsistent.
    const ratioSupported = !isPro || Object.hasOwn(GEMINI_25, ratio);
    const pixels = permitted.includes(tier) && ratioSupported && !(tier === '512' && ratio === '21:9') ? GEMINI_3[tier]?.[ratio] : undefined;
    return pixels ? knownResolution(pixels, GOOGLE_IMAGE_SOURCE) : unknownResolution(size);
  }
  if (tier === 'auto') {
    if (modelId === 'recraft/recraft-v3') {
      const pixels = RECRAFT_V3[ratio];
      if (pixels) return knownResolution(pixels, RECRAFT_IMAGE_SOURCE);
    }
    if (recraftV4.has(modelId) || recraftPro.has(modelId)) {
      const pixels = RECRAFT_V4[ratio];
      if (pixels) return knownResolution(recraftPro.has(modelId) ? [pixels[0] * 2, pixels[1] * 2] : pixels, RECRAFT_IMAGE_SOURCE);
    }
  }
  // K tiers, pixel budgets, and maximum side lengths are not exact width/height promises.
  return unknownResolution(size);
}
