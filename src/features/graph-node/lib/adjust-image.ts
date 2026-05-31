export interface ImageAdjustmentValues {
  exposure: number;
  gamma: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
}

export async function adjustImageBlob(sourceBlob: Blob, values: ImageAdjustmentValues, fileName: string) {
  const image = await loadImageFromBlob(sourceBlob);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is not available in this browser.');

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  applyAdjustments(imageData.data, values);
  context.putImageData(imageData, 0, 0);

  const blob = await canvasToBlob(canvas, 'image/png');
  return new File([blob], fileName, { type: 'image/png' });
}

function applyAdjustments(data: Uint8ClampedArray, values: ImageAdjustmentValues) {
  const exposureFactor = 2 ** (values.exposure / 100);
  const gammaExponent = clamp(1 - values.gamma / 150, 0.2, 3);
  const contrastFactor = (100 + values.contrast) / 100;
  const saturationFactor = (100 + values.saturation) / 100;

  for (let index = 0; index < data.length; index += 4) {
    let red = data[index] * exposureFactor;
    let green = data[index + 1] * exposureFactor;
    let blue = data[index + 2] * exposureFactor;

    red = 255 * ((clamp(red, 0, 255) / 255) ** gammaExponent);
    green = 255 * ((clamp(green, 0, 255) / 255) ** gammaExponent);
    blue = 255 * ((clamp(blue, 0, 255) / 255) ** gammaExponent);

    red = (red - 128) * contrastFactor + 128;
    green = (green - 128) * contrastFactor + 128;
    blue = (blue - 128) * contrastFactor + 128;

    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const highlightWeight = luminance > 128 ? (luminance - 128) / 127 : 0;
    const shadowWeight = luminance < 128 ? (128 - luminance) / 128 : 0;
    const tonalOffset = values.highlights * 0.65 * highlightWeight + values.shadows * 0.65 * shadowWeight;

    red += tonalOffset + values.temperature * 0.45 + values.tint * 0.25;
    green += tonalOffset - values.tint * 0.25;
    blue += tonalOffset - values.temperature * 0.45 + values.tint * 0.25;

    const adjustedLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red = adjustedLuminance + (red - adjustedLuminance) * saturationFactor;
    green = adjustedLuminance + (green - adjustedLuminance) * saturationFactor;
    blue = adjustedLuminance + (blue - adjustedLuminance) * saturationFactor;

    data[index] = clamp(red, 0, 255);
    data[index + 1] = clamp(green, 0, 255);
    data[index + 2] = clamp(blue, 0, 255);
  }
}

function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение для коррекции.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Не удалось сохранить скорректированное изображение.'));
    }, type);
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
