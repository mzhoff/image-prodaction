import { FrequencyRetouchRenderer } from './frequency-retouch-renderer';
import {
  normalizeFrequencyRetouchValues,
  type FrequencyRetouchValues,
} from './frequency-retouch-values';
import {
  loadRetouchImageFromBlob,
  loadRetouchImageFromDataUrl,
  retouchCanvasToBlob,
} from './frequency-retouch-webgl';

export type { FrequencyRetouchValues } from './frequency-retouch-values';

export async function frequencyRetouchImageBlob(
  sourceBlob: Blob,
  values: FrequencyRetouchValues,
  fileName: string,
  maskDataUrl?: string | null,
) {
  const image = await loadRetouchImageFromBlob(sourceBlob);
  const maskImage = maskDataUrl ? await loadRetouchImageFromDataUrl(maskDataUrl) : undefined;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const renderer = new FrequencyRetouchRenderer(canvas);
  try {
    renderer.init(image, maskImage);
    renderer.render(normalizeFrequencyRetouchValues(values));
    const blob = await retouchCanvasToBlob(canvas, 'image/png');
    return new File([blob], fileName, { type: 'image/png' });
  } finally {
    renderer.destroy();
  }
}
