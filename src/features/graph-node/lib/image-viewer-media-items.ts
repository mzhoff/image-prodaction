import type { MediaItem } from '@prodactionpro/ui-media';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { getRemoteAssetContentUrl } from '@/entities/production-graph/lib/remote-asset';
import type { ImageViewerItem } from '../ui/image-viewer-types';

export interface ResolvedViewerThumbnail { blobKey: string; url: string }

/** Product IDs, storage references and API routes stop at this adapter. */
export function createImageViewerMediaItems({ asset, assetId, assets, currentIndex, historyAssetIds, items, thumbnails, url }: {
  asset?: AssetRecord;
  assetId?: string;
  assets: AssetRecord[];
  currentIndex: number;
  historyAssetIds: string[];
  items?: ImageViewerItem[];
  thumbnails?: ReadonlyMap<string, ResolvedViewerThumbnail>;
  url: string;
}): { items: MediaItem[]; selectedId: string } {
  const selectedId = assetId ?? historyAssetIds[currentIndex] ?? 'image-preview';
  const ids = historyAssetIds.length ? historyAssetIds : [selectedId];
  const assetsById = new Map(assets.map((entry) => [entry.id, entry]));
  if (asset) assetsById.set(asset.id, asset);
  const itemsById = new Map(items?.map((item) => [item.id, item]));
  const mediaItems = ids.map((id): MediaItem => {
    const item = itemsById.get(id);
    const record = assetsById.get(id);
    const storage = record?.storage;
    const remoteId = storage?.type === 'remote' ? storage.assetId : id;
    const resolved = thumbnails?.get(id);
    const legacyThumbnail = storage?.type === 'indexeddb' && resolved?.blobKey === storage.blobKey ? resolved.url : undefined;
    const originalUrl = item?.url ?? (storage?.type === 'indexeddb' ? legacyThumbnail ?? '' : getRemoteAssetContentUrl(remoteId));
    return {
      id,
      url: id === selectedId ? url : originalUrl,
      thumbnailUrl: item?.thumbnailUrl ?? (item ? item.url : storage?.type === 'indexeddb' ? legacyThumbnail : getRemoteAssetContentUrl(remoteId, 'thumbnail')),
      name: item?.name ?? record?.name,
      width: item?.width ?? record?.width,
      height: item?.height ?? record?.height,
      kind: 'image',
    };
  });
  return { items: mediaItems, selectedId };
}
