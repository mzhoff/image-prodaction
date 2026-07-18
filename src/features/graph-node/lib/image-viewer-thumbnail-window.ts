export const IMAGE_VIEWER_THUMBNAIL_WINDOW_SIZE = 15;

export interface ImageViewerThumbnailEntry {
  assetId: string;
  index: number;
}

export function getImageViewerThumbnailWindow(
  assetIds: string[],
  currentIndex: number,
  windowSize = IMAGE_VIEWER_THUMBNAIL_WINDOW_SIZE,
): ImageViewerThumbnailEntry[] {
  if (assetIds.length === 0 || windowSize <= 0) return [];

  const size = Math.min(Math.max(1, Math.floor(windowSize)), assetIds.length);
  const safeCurrentIndex = Math.min(
    Math.max(0, Math.floor(currentIndex)),
    assetIds.length - 1,
  );
  const preferredStart = safeCurrentIndex - Math.floor(size / 2);
  const start = Math.min(
    Math.max(0, preferredStart),
    assetIds.length - size,
  );

  return assetIds.slice(start, start + size).map((assetId, offset) => ({
    assetId,
    index: start + offset,
  }));
}
