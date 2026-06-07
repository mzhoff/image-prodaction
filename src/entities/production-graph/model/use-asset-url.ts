'use client';

import { useProductionGraphStore } from './use-production-graph-store';

export function useAssetUrl(assetId?: string) {
  return useProductionGraphStore((state) => (
    state.assets.find((item) => item.id === assetId)?.storage.publicUrl ?? null
  ));
}
