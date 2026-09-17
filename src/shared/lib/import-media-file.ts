// This only routes the upload. The server validates the actual container/codecs.
export function getImportMediaKind(file: Pick<File, 'name' | 'type'>): 'image' | 'audio' | 'video' | undefined {
  if (/\.(mp4|mov|webm)$/i.test(file.name) || file.type.startsWith('video/')) return 'video';
  if (/\.(mp3|wav|flac|ogg|opus|m4a|aac)$/i.test(file.name) || file.type.startsWith('audio/')) return 'audio';
  if (/\.(png|jpe?g|webp|gif|svg|avif|heic|heif)$/i.test(file.name) || file.type.startsWith('image/')) return 'image';
  return undefined;
}

export function hasImportMediaFile(data: DataTransfer | null) {
  return Boolean(data && (Array.from(data.items).some((item) => item.kind === 'file'
    && (!item.type || /^(image|audio|video)\//.test(item.type)))
    || Array.from(data.files).some((file) => getImportMediaKind(file))));
}

export function getImportMediaFiles(data: DataTransfer | null) {
  if (!data) return [];
  const items = Array.from(data.items).filter((item) => item.kind === 'file').map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file && getImportMediaKind(file)));
  return items.length ? items : Array.from(data.files).filter((file) => getImportMediaKind(file));
}
