import type { CropRect } from '@/entities/production-graph/model/types';

export const cropAspectRatioOptions = ['Custom', '1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '3:2', '2:3'];

const MIN_CROP = 0.03;

export function fullCrop(): CropRect {
  return { x: 0, y: 0, width: 1, height: 1 };
}

export function cropPixelSize(crop: CropRect, sourceWidth?: number, sourceHeight?: number) {
  return {
    width: Math.max(1, Math.round(crop.width * (sourceWidth ?? 1))),
    height: Math.max(1, Math.round(crop.height * (sourceHeight ?? 1))),
  };
}

export function aspectRatioValue(value: string, crop?: CropRect, sourceWidth?: number, sourceHeight?: number) {
  if (value !== 'Custom') {
    const [width, height] = value.split(':').map(Number);
    if (width > 0 && height > 0) return width / height;
  }
  if (crop && sourceWidth && sourceHeight) {
    return (crop.width * sourceWidth) / (crop.height * sourceHeight);
  }
  return null;
}

export function fitCropToAspect(sourceWidth: number, sourceHeight: number, aspectRatio: number): CropRect {
  const sourceAspectRatio = sourceWidth / sourceHeight;
  if (sourceAspectRatio > aspectRatio) {
    const width = aspectRatio / sourceAspectRatio;
    return normalizeCrop({ x: (1 - width) / 2, y: 0, width, height: 1 });
  }
  const height = sourceAspectRatio / aspectRatio;
  return normalizeCrop({ x: 0, y: (1 - height) / 2, width: 1, height });
}

export function cropFromPixelSize(params: {
  crop: CropRect;
  height: number;
  locked: boolean;
  pixelHeight?: number;
  pixelWidth?: number;
  ratio: number | null;
  width: number;
}) {
  const { crop, height, locked, pixelHeight, pixelWidth, ratio, width } = params;
  const currentSize = cropPixelSize(crop, width, height);
  let nextWidth = Math.max(1, Math.min(width, pixelWidth ?? currentSize.width));
  let nextHeight = Math.max(1, Math.min(height, pixelHeight ?? currentSize.height));

  if (locked && ratio) {
    if (pixelWidth !== undefined) {
      nextHeight = Math.round(nextWidth / ratio);
      if (nextHeight > height) {
        nextHeight = height;
        nextWidth = Math.round(nextHeight * ratio);
      }
    } else {
      nextWidth = Math.round(nextHeight * ratio);
      if (nextWidth > width) {
        nextWidth = width;
        nextHeight = Math.round(nextWidth / ratio);
      }
    }
  }

  const nextNormalizedWidth = nextWidth / width;
  const nextNormalizedHeight = nextHeight / height;
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  return normalizeCrop({
    x: centerX - nextNormalizedWidth / 2,
    y: centerY - nextNormalizedHeight / 2,
    width: nextNormalizedWidth,
    height: nextNormalizedHeight,
  });
}

export function normalizeCrop(crop: CropRect): CropRect {
  const width = clamp(crop.width, MIN_CROP, 1);
  const height = clamp(crop.height, MIN_CROP, 1);
  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
