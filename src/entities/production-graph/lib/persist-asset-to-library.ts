'use client';

import type { AssetRecord } from '../model/types';
import { useProductionGraphStore } from '../model/use-production-graph-store';
import { saveAssetToLibrary } from './asset-db';

export function isAssetInLibrary(asset: AssetRecord | undefined) {
  return Boolean(asset && (asset.storage.type === 'remote' || asset.libraryAssetId));
}

export async function persistAssetToLibrary(asset: AssetRecord) {
  if (asset.storage.type === 'remote') return asset;
  if (asset.libraryAssetId) {
    const existing = useProductionGraphStore.getState().assets
      .find((item) => item.id === asset.libraryAssetId);
    if (existing) return existing;
  }

  const savedAsset = await saveAssetToLibrary(asset);
  useProductionGraphStore.setState((state) => ({
    assets: [
      ...state.assets.map((item) => (
        item.id === asset.id
          ? { ...item, libraryAssetId: savedAsset.id }
          : item
      )),
      ...(state.assets.some((item) => item.id === savedAsset.id) ? [] : [savedAsset]),
    ],
  }));
  return savedAsset;
}
