import type { ExportImageBackground, ExportImageFormat, ExportImageScale } from '@/entities/production-graph/model/types';

export interface ExportImageOptions {
  background: ExportImageBackground;
  format: ExportImageFormat;
  quality: string;
  scale: ExportImageScale;
}

export interface ExportedImage {
  blob: Blob;
  extension: string;
  height: number;
  mimeType: string;
  width: number;
}

const FORMAT_META: Record<ExportImageFormat, { extension: string; mimeType: string }> = {
  jpeg: { extension: 'jpg', mimeType: 'image/jpeg' },
  png: { extension: 'png', mimeType: 'image/png' },
  webp: { extension: 'webp', mimeType: 'image/webp' },
};

export async function exportImageBlob(sourceBlob: Blob, options: ExportImageOptions): Promise<ExportedImage> {
  const image = await loadImage(sourceBlob);
  const scale = Number.parseFloat(options.scale) || 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось подготовить canvas для экспорта.');

  const fill = getBackgroundFill(options.background, options.format);
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);

  const meta = FORMAT_META[options.format];
  const quality = options.format === 'png' ? undefined : normalizeQuality(options.quality);
  const blob = await canvasToBlob(canvas, meta.mimeType, quality);
  return { blob, extension: meta.extension, height, mimeType: meta.mimeType, width };
}

export function getExportFileName(sourceName: string | undefined, extension: string) {
  const baseName = (sourceName || 'reverie-export')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\wа-яА-ЯёЁ-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'reverie-export';

  return `${baseName}.${extension}`;
}

function getBackgroundFill(background: ExportImageBackground, format: ExportImageFormat) {
  if (background === 'white' || (format === 'jpeg' && background === 'transparent')) return '#fff';
  if (background === 'black') return '#000';
  return null;
}

function normalizeQuality(value: string) {
  const quality = Number.parseInt(value, 10);
  if (Number.isNaN(quality)) return 0.9;
  return Math.min(Math.max(quality, 1), 100) / 100;
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение для экспорта.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Браузер не смог создать файл экспорта.'));
    }, mimeType, quality);
  });
}
