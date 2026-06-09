const HISTOGRAM_BINS = 256;

export interface ImageHistogram {
  blue: number[];
  green: number[];
  master: number[];
  red: number[];
}

export async function buildImageHistogramFromBlob(sourceBlob: Blob) {
  const image = await loadImageFromBlob(sourceBlob);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const sampleLimit = 100_000;
  const scale = Math.min(1, Math.sqrt(sampleLimit / (sourceWidth * sourceHeight)));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Не удалось создать canvas для гистограммы.');

  context.drawImage(image, 0, 0, width, height);
  const sourceData = context.getImageData(0, 0, width, height).data;

  const red = new Float32Array(HISTOGRAM_BINS);
  const green = new Float32Array(HISTOGRAM_BINS);
  const blue = new Float32Array(HISTOGRAM_BINS);
  const master = new Float32Array(HISTOGRAM_BINS);
  const denominator = HISTOGRAM_BINS - 1;

  for (let index = 0; index < sourceData.length; index += 4) {
    const sourceRed = sourceData[index];
    const sourceGreen = sourceData[index + 1];
    const sourceBlue = sourceData[index + 2];

    red[Math.round((sourceRed / 255) * denominator)] += 1;
    green[Math.round((sourceGreen / 255) * denominator)] += 1;
    blue[Math.round((sourceBlue / 255) * denominator)] += 1;

    const sourceLuma = Math.round((0.2126 * sourceRed + 0.7152 * sourceGreen + 0.0722 * sourceBlue) * (denominator / 255));
    master[sourceLuma] += 1;
  }

  if ('close' in image && typeof image.close === 'function') image.close();

  return {
    blue: Array.from(blue),
    green: Array.from(green),
    master: Array.from(master),
    red: Array.from(red),
  } satisfies ImageHistogram;
}

async function loadImageFromBlob(blob: Blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob);

  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
