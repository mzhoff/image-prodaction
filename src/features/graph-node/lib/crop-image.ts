import type { CropRect } from '@/entities/production-graph/model/types';

export async function cropImageBlob(sourceBlob: Blob, crop: CropRect, fileName: string) {
  const image = await loadImage(sourceBlob);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const cropX = Math.round(crop.x * sourceWidth);
  const cropY = Math.round(crop.y * sourceHeight);
  const cropWidth = Math.max(1, Math.round(crop.width * sourceWidth));
  const cropHeight = Math.max(1, Math.round(crop.height * sourceHeight));

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось подготовить canvas для crop.');

  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  const blob = await canvasToBlob(canvas, 'image/png');
  return new File([blob], fileName, { type: 'image/png' });
}

function loadImage(blob: Blob) {
  const url = URL.createObjectURL(blob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение для crop.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Не удалось сохранить crop как изображение.'));
    }, type);
  });
}
