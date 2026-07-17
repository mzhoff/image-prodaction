import { saveUploadedImageAsset } from './asset-db';
import type { AssetRecord } from '../model/types';

const BANNER_WEBP_QUALITY = 0.86;

export async function saveBannerAsset(file: File): Promise<AssetRecord> {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available in this browser.');

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  const blob = await canvasToBlob(canvas, 'image/webp', BANNER_WEBP_QUALITY);
  return saveUploadedImageAsset(new File(
    [blob],
    toWebpName(file.name),
    { type: 'image/webp' },
  ));
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read banner image.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Could not convert banner to WebP.'));
    }, mimeType, quality);
  });
}

function toWebpName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim() || 'banner';
  return `${baseName}.webp`;
}
