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
  return getImageFilesFromDataTransfer(dataTransfer, fallbackPrefix)[0] ?? null;
}

export function getImageFilesFromDataTransfer(dataTransfer: DataTransfer | null, fallbackPrefix: string) {
  if (!dataTransfer) return [];

  const itemFiles = Array.from(dataTransfer.items)
    .filter((transferItem) => transferItem.kind === 'file')
    .map((transferItem) => transferItem.getAsFile())
    .filter((file): file is File => {
      if (!file) return false;
      return isImageFile(file);
    });
  const files = itemFiles.length ? itemFiles : Array.from(dataTransfer.files).filter(isImageFile);

  return files.map((file, index) => normalizeImageFile(file, files.length > 1 ? `${fallbackPrefix}-${index + 1}` : fallbackPrefix));
}

function normalizeImageFile(file: File, fallbackPrefix: string) {
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
