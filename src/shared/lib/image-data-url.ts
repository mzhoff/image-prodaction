import { IMAGE_GENERATION_REQUEST_MAX_BYTES } from '@/shared/api/image-request-limits';

export const OPENROUTER_IMAGE_MAX_BYTES = 4_500_000;
export const OPENROUTER_IMAGE_MAX_SIDE = 1536;

/** Generate Image sends original pixels; its durable server worker optimises encoding. */
export async function prepareGenerationReferenceForServer(blob: Blob) {
  if (!isBrowserSafeImage(blob.type)) throw new Error('Для референса используйте PNG, JPEG, WebP или GIF.');
  if (4 * Math.ceil(blob.size / 3) + 128 > IMAGE_GENERATION_REQUEST_MAX_BYTES) {
    throw new Error('Референс превышает лимит передачи 30 МиБ с учётом base64. Уменьшите вес файла без изменения разрешения.');
  }
  return blobToDataUrl(blob);
}

export async function prepareImageForOpenRouter(blob: Blob) {
  if (blob.size <= OPENROUTER_IMAGE_MAX_BYTES && isBrowserSafeImage(blob.type)) {
    return blobToDataUrl(blob);
  }

  const bitmap = await loadBitmap(blob);
  const scale = Math.min(1, OPENROUTER_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось подготовить изображение для OpenRouter.');
  context.drawImage(bitmap, 0, 0, width, height);

  for (const quality of [0.86, 0.78, 0.68, 0.58]) {
    const compressed = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (compressed.size <= OPENROUTER_IMAGE_MAX_BYTES) return blobToDataUrl(compressed);
  }

  throw new Error('Изображение слишком большое для передачи в модель. Попробуйте загрузить файл меньшего размера.');
}

export async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/png' });
}

function isBrowserSafeImage(mimeType: string) {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType);
}

async function loadBitmap(blob: Blob) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(blob);
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
      element.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Не удалось сжать изображение.'));
    }, type, quality);
  });
}
