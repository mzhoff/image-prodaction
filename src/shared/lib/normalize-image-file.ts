const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const HEIC_EXTENSION_PATTERN = /\.hei[cf]$/i;
const JPEG_QUALITY = 0.92;

export async function normalizeImageFileForStorage(file: File): Promise<File> {
  if (!isHeicImageFile(file)) return file;

  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: JPEG_QUALITY,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!blob) throw new Error('HEIC conversion returned an empty result.');

  return new File([blob], getConvertedJpegName(file.name), { type: 'image/jpeg' });
}

export function isHeicImageFile(file: File) {
  const mimeType = file.type.toLowerCase();
  return HEIC_MIME_TYPES.has(mimeType) || HEIC_EXTENSION_PATTERN.test(file.name);
}

function getConvertedJpegName(name: string) {
  if (!name) return `image-${Date.now()}.jpg`;
  if (HEIC_EXTENSION_PATTERN.test(name)) return name.replace(HEIC_EXTENSION_PATTERN, '.jpg');
  return `${name}.jpg`;
}
