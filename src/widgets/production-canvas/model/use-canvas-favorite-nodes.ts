'use client';

import { useCallback } from 'react';
import { useFavoriteNodePresets } from '@/entities/production-graph/api/use-favorite-node-presets';
import type { GraphPoint } from '@/entities/production-graph/model/types';
import type { useProductionCanvasStore } from './use-production-canvas-store';

type GraphModel = ReturnType<typeof useProductionCanvasStore>;

export function useCanvasFavoriteNodes({ closeContextMenu, getPalettePosition,
  graph, showToast, workspaceId }: {
  closeContextMenu: () => void;
  getPalettePosition: () => GraphPoint;
  graph: GraphModel;
  showToast: (message: string) => void;
  workspaceId?: string;
}) {
  const favorites = useFavoriteNodePresets(workspaceId);
  const createFavoriteNode = useCallback((favoriteId: string, position: GraphPoint) => {
    const favorite = favorites.favorites.find((item) => item.id === favoriteId);
    if (!favorite) {
      showToast('Favorite node is no longer available.');
      return null;
    }
    const nodeId = graph.addNodeFromFavorite(favorite.snapshot, position);
    if (favorite.snapshot.nodeType === 'generateImage') {
      graph.setNodeUiState(nodeId, { state: 'Collapsed' });
    }
    return nodeId;
  }, [favorites.favorites, graph, showToast]);
  const createFavoriteNodeFromPalette = useCallback((favoriteId: string) => {
    createFavoriteNode(favoriteId, getPalettePosition());
    closeContextMenu();
  }, [closeContextMenu, createFavoriteNode, getPalettePosition]);

  return { ...favorites, createFavoriteNode, createFavoriteNodeFromPalette };
}
