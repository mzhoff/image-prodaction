import { applyAdjustmentsToPixels } from '@/shared/lib/image-renderer/canvas-adjustment';
import type { ImageAdjustmentValues } from '@/shared/lib/image-renderer/adjustment-types';

export type { ImageAdjustmentValues };

export async function adjustImageBlob(sourceBlob: Blob, values: ImageAdjustmentValues, fileName: string) {
  const image = await loadImageFromBlob(sourceBlob);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is not available in this browser.');

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  applyAdjustmentsToPixels(imageData.data, values);
  context.putImageData(imageData, 0, 0);

  const blob = await canvasToBlob(canvas, 'image/png');
  return new File([blob], fileName, { type: 'image/png' });
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
