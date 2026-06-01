import type { ImageAdjustmentValues } from './adjustment-types';

export function drawAdjustedImagePreview(canvas: HTMLCanvasElement, image: HTMLImageElement, values: ImageAdjustmentValues) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return;

  const targetWidth = Math.max(1, Math.round(Math.min(sourceWidth, (canvas.clientWidth || 368) * window.devicePixelRatio)));
  const targetHeight = Math.max(1, Math.round(targetWidth / (sourceWidth / sourceHeight)));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  applyAdjustmentsToPixels(imageData.data, values);
  context.putImageData(imageData, 0, 0);
}

export function applyAdjustmentsToPixels(data: Uint8ClampedArray, values: ImageAdjustmentValues) {
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

