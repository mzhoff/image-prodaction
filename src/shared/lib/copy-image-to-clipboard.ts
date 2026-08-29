const PNG_MIME_TYPE = 'image/png';

export interface ImageClipboardPort {
  createItem: (payload: Record<string, Blob | Promise<Blob>>) => unknown;
  write: (items: unknown[]) => Promise<void>;
}

interface CopyImageToClipboardOptions {
  clipboard?: ImageClipboardPort;
  convertToPng?: (blob: Blob) => Promise<Blob>;
}

export class ImageClipboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageClipboardError';
  }
}

export async function copyImageBlobToClipboard(
  loadBlob: () => Promise<Blob | null>,
  options: CopyImageToClipboardOptions = {},
) {
  const clipboard = options.clipboard ?? getBrowserImageClipboardPort();
  const convertToPng = options.convertToPng ?? convertImageBlobToPng;
  const pngPromise = Promise.resolve()
    .then(loadBlob)
    .then((blob) => {
      if (!blob) throw new ImageClipboardError('The current image could not be loaded.');
      if (blob.type && !blob.type.toLowerCase().startsWith('image/')) {
        throw new ImageClipboardError('The current asset is not an image.');
      }
      return convertToPng(blob);
    });

  const item = clipboard.createItem({ [PNG_MIME_TYPE]: pngPromise });
  await clipboard.write([item]);
}

export async function convertImageBlobToPng(blob: Blob) {
  if (normalizeMimeType(blob.type) === PNG_MIME_TYPE) {
    return blob.type === PNG_MIME_TYPE ? blob : new Blob([blob], { type: PNG_MIME_TYPE });
  }

  const decoded = await decodeImageBlob(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageClipboardError('The image could not be prepared for copying.');
    context.drawImage(decoded.source, 0, 0);
    return await canvasToPngBlob(canvas);
  } finally {
    decoded.release();
  }
}

export function getImageClipboardErrorMessage(error: unknown) {
  if (error instanceof ImageClipboardError) return error.message;
  if (error instanceof Error && error.name === 'NotAllowedError') {
    return 'Clipboard access was denied. Use Download current instead.';
  }
  return 'Could not copy the image. Use Download current instead.';
}

function getBrowserImageClipboardPort(): ImageClipboardPort {
  if (typeof navigator === 'undefined'
    || typeof navigator.clipboard?.write !== 'function'
    || typeof ClipboardItem === 'undefined') {
    throw new ImageClipboardError(
      'Image copying is not supported in this browser. Use Download current instead.',
    );
  }

  return {
    createItem: (payload) => new ClipboardItem(payload),
    write: (items) => navigator.clipboard.write(items as ClipboardItem[]),
  };
}

async function decodeImageBlob(blob: Blob): Promise<{
  height: number;
  release: () => void;
  source: CanvasImageSource;
  width: number;
}> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      height: bitmap.height,
      release: () => bitmap.close(),
      source: bitmap,
      width: bitmap.width,
    };
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new ImageClipboardError('The image could not be decoded.'));
      element.src = url;
    });
    return {
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
      source: image,
      width: image.naturalWidth,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ImageClipboardError('The image could not be converted to PNG.'));
    }, PNG_MIME_TYPE);
  });
}

function normalizeMimeType(value: string) {
  return value.split(';')[0]?.trim().toLowerCase();
}
