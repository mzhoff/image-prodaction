'use client';

import { useEffect, useState } from 'react';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { loadAssetBlob } from '@/shared/lib/asset-db';

export function useAssetUrl(assetId?: string) {
  const asset = useProductionGraphStore((state) => state.assets.find((item) => item.id === assetId));
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!asset) {
      setUrl(null);
      return undefined;
    }

    void loadAssetBlob(asset).then((blob) => {
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset]);

  return url;
}
