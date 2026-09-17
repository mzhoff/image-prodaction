'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadAssetBlobByKey } from '@/entities/production-graph/lib/asset-db';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { createImagePreviewBlob } from '@/shared/lib/image-preview';
import { createImageViewerMediaItems, type ResolvedViewerThumbnail } from '../lib/image-viewer-media-items';
import { getImageViewerThumbnailWindow } from '../lib/image-viewer-thumbnail-window';

type ViewerItemsOptions = Omit<Parameters<typeof createImageViewerMediaItems>[0], 'assets' | 'thumbnails'>;

export function useImageViewerItems(options: ViewerItemsOptions) {
  const assets = useProductionGraphStore((state) => state.assets);
  const [thumbnails, setThumbnails] = useState<Map<string, ResolvedViewerThumbnail>>(new Map());
  const { currentIndex, historyAssetIds, items } = options;
  const localEntries = useMemo(() => {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const suppliedIds = new Set(items?.map((item) => item.id));
    return getImageViewerThumbnailWindow(historyAssetIds, currentIndex).flatMap(({ assetId }) => {
      const storage = assetsById.get(assetId)?.storage;
      return !suppliedIds.has(assetId) && storage?.type === 'indexeddb' ? [{ id: assetId, blobKey: storage.blobKey }] : [];
    });
  }, [assets, currentIndex, historyAssetIds, items]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    const resolved = new Map<string, ResolvedViewerThumbnail>();
    setThumbnails(resolved);
    // Legacy originals stay in IndexedDB; only the bounded thumbnail window is decoded.
    void Promise.all(localEntries.map(async ({ id, blobKey }) => {
      try {
        const blob = await loadAssetBlobByKey(blobKey);
        if (!blob || cancelled) return;
        const thumbnail = await createImagePreviewBlob(blob);
        if (cancelled) return;
        const url = URL.createObjectURL(thumbnail);
        objectUrls.push(url);
        resolved.set(id, { blobKey, url });
        setThumbnails(new Map(resolved));
      } catch {
        // A missing legacy thumbnail must not prevent opening the selected original.
      }
    }));
    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [localEntries]);

  return createImageViewerMediaItems({ ...options, assets, thumbnails });
}
