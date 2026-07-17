'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchLibraryAssets } from '../api/library-api';
import type {
  LibraryAssetItem,
  LibraryFacets,
  LibraryFilters,
} from './types';

export function useLibraryAssets(workspaceId: string | undefined, filters: LibraryFilters) {
  const [items, setItems] = useState<LibraryAssetItem[]>([]);
  const [facets, setFacets] = useState<LibraryFacets>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);
  const stableFilters = useMemo(() => filters, [filterKey]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!workspaceId) {
      setItems([]);
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetchLibraryAssets(workspaceId, stableFilters, null, signal);
      setItems(response.items);
      setFacets(response.facets ?? {});
      setNextCursor(response.nextCursor ?? null);
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') return;
      setError(caughtError instanceof Error ? caughtError.message : 'Библиотека недоступна.');
      setItems([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [stableFilters, workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (!workspaceId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetchLibraryAssets(workspaceId, stableFilters, nextCursor);
      setItems((current) => mergeItems(current, response.items));
      setFacets(response.facets ?? facets);
      setNextCursor(response.nextCursor ?? null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Не удалось загрузить следующую страницу.');
    } finally {
      setLoadingMore(false);
    }
  }, [facets, loadingMore, nextCursor, stableFilters, workspaceId]);

  return {
    error,
    facets,
    items,
    loadMore,
    loading,
    loadingMore,
    nextCursor,
    refresh,
  };
}

function mergeItems(current: LibraryAssetItem[], incoming: LibraryAssetItem[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
