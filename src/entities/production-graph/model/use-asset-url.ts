'use client';

import { useEffect, useState } from 'react';
import { loadAssetBlobByKey } from '../lib/asset-db';
import { getRemoteAssetContentUrl } from '../lib/remote-asset';
import { useProductionGraphStore } from './use-production-graph-store';
import { createImagePreviewBlob } from '@/shared/lib/image-preview';

export function useAssetUrl(assetId?: string, variant?: 'thumbnail') {
  const asset = useProductionGraphStore((state) => state.assets.find((item) => item.id === assetId));
  const storage = asset?.storage;
  const resourceKey = storage?.type === 'indexeddb' ? `${storage.blobKey}:${variant ?? 'original'}` : undefined;
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!storage || storage.type === 'remote' || !resourceKey) return undefined;

    void loadAssetBlobByKey(storage.blobKey).then(async (blob) => {
      if (!blob || cancelled) return;
      const content = variant === 'thumbnail' ? await createImagePreviewBlob(blob) : blob;
      if (cancelled) return;
      objectUrl = URL.createObjectURL(content);
      setResolved({ key: resourceKey, url: objectUrl });
    }).catch(() => { if (!cancelled) setResolved(null); });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setResolved((current) => current?.url === objectUrl ? null : current);
      }
    };
  }, [resourceKey, storage, variant]);

  if (storage?.type === 'remote') return getRemoteAssetContentUrl(storage.assetId, variant);
  // Never expose the previous file's URL with the newly selected asset's name
  // while its IndexedDB blob/thumbnail is still loading.
  return resolved?.key === resourceKey ? resolved?.url ?? null : null;
}
