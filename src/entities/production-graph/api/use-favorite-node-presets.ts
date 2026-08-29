'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  createFavoriteNodeSnapshot,
  favoriteNodeSnapshotsEqual,
  type FavoriteNodePreset,
} from '@/entities/production-graph/model/favorite-node-preset';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import {
  deleteFavoriteNodePreset,
  fetchFavoriteNodes,
  saveFavoriteNodePreset,
} from './favorite-node-api';

export function useFavoriteNodePresets(workspaceId?: string) {
  const [favorites, setFavorites] = useState<FavoriteNodePreset[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      setFavorites([]);
      setError(undefined);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setError(undefined);
    setLoading(true);
    void fetchFavoriteNodes(workspaceId, controller.signal)
      .then((next) => setFavorites(next))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : 'Could not load Favorite.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId]);

  const findMatchingFavorite = useCallback((node: Pick<ProductionNode, 'data' | 'type'>) => {
    const snapshot = createFavoriteNodeSnapshot(node);
    return favorites.find((favorite) => favoriteNodeSnapshotsEqual(favorite.snapshot, snapshot));
  }, [favorites]);

  const saveFavorite = useCallback(async (node: Pick<ProductionNode, 'data' | 'type'>) => {
    if (!workspaceId) throw new Error('Workspace is not ready yet.');
    const result = await saveFavoriteNodePreset(workspaceId, node);
    setFavorites((current) => [
      result.favorite,
      ...current.filter((favorite) => favorite.id !== result.favorite.id),
    ]);
    return result;
  }, [workspaceId]);

  const removeFavorite = useCallback(async (favoriteId: string) => {
    if (!workspaceId) throw new Error('Workspace is not ready yet.');
    await deleteFavoriteNodePreset(workspaceId, favoriteId);
    setFavorites((current) => current.filter((favorite) => favorite.id !== favoriteId));
  }, [workspaceId]);

  return { error, favorites, findMatchingFavorite, loading, removeFavorite, saveFavorite };
}
