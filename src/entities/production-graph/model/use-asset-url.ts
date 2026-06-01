'use client';

import { useEffect, useState } from 'react';
import { loadAssetBlobByKey } from '../lib/asset-db';
import { useProductionGraphStore } from './use-production-graph-store';

export function useAssetUrl(assetId?: string) {
  const asset = useProductionGraphStore((state) => state.assets.find((item) => item.id === assetId));
  const blobKey = asset?.storage.blobKey;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!blobKey) {
      setUrl(null);
      return undefined;
    }

    void loadAssetBlobByKey(blobKey).then((blob) => {
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobKey]);

  return url;
}
