export function hasImageFileInDataTransfer(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;

  return Array.from(dataTransfer.items).some((item) => (
    item.kind === 'file' && (!item.type || item.type.startsWith('image/'))
  )) || Array.from(dataTransfer.files).some(isImageFile);
}

export function hasFileInDataTransfer(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;

  return Array.from(dataTransfer.items).some((item) => item.kind === 'file') || dataTransfer.files.length > 0;
}

export function getImageFileFromDataTransfer(dataTransfer: DataTransfer | null, fallbackPrefix: string) {
  if (!dataTransfer) return null;

  const item = Array.from(dataTransfer.items).find((transferItem) => (
    transferItem.kind === 'file' && transferItem.type.startsWith('image/')
  ));
  const file = item?.getAsFile() ?? Array.from(dataTransfer.files).find((transferFile) => (
    isImageFile(transferFile)
  ));
  if (!file) return null;

  const mimeType = getImageMimeType(file);
  const extension = getImageExtension(mimeType, file.name);
  const name = file.name && file.name !== 'image.png'
    ? file.name
    : `${fallbackPrefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;

  return new File([file], name, { type: mimeType });
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|avif|heic|heif)$/i.test(file.name);
}

function getImageMimeType(file: File) {
  if (file.type.startsWith('image/')) return file.type;
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg';
  if (/\.webp$/i.test(file.name)) return 'image/webp';
  if (/\.gif$/i.test(file.name)) return 'image/gif';
  if (/\.svg$/i.test(file.name)) return 'image/svg+xml';
  if (/\.avif$/i.test(file.name)) return 'image/avif';
  if (/\.hei[cf]$/i.test(file.name)) return 'image/heic';
  return 'image/png';
}

function getImageExtension(mimeType: string, fileName?: string) {
  const nameExtension = fileName?.match(/\.([a-z0-9]+)$/i)?.[1];
  if (nameExtension) return nameExtension.toLowerCase();
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  if (mimeType === 'image/avif') return 'avif';
  if (mimeType === 'image/heic') return 'heic';
  return 'png';
}
