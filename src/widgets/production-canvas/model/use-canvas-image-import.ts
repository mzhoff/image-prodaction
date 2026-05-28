'use client';

import { useCallback, useRef } from 'react';
import type { AssetRecord, GraphPoint } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { saveImageAsset } from '@/shared/lib/asset-db';

interface UseCanvasImageImportParams {
  getFallbackPastePosition: () => GraphPoint;
  pasteImageAsset: (asset: AssetRecord, position: GraphPoint, targetNodeId?: string) => void;
}

export function useCanvasImageImport({
  getFallbackPastePosition,
  pasteImageAsset,
}: UseCanvasImageImportParams) {
  const imageImportInFlightRef = useRef(false);

  return useCallback(async (file: File, position?: GraphPoint, targetNodeId?: string) => {
    if (imageImportInFlightRef.current) return;
    imageImportInFlightRef.current = true;

    try {
      const asset = await saveImageAsset(file);
      const state = useProductionGraphStore.getState();
      const selectedImports = state.nodes.filter((node) => (
        node.type === 'importImage' && state.selectedNodeIds.includes(node.id)
      ));
      const targetNode = targetNodeId
        ? state.nodes.find((node) => node.id === targetNodeId && node.type === 'importImage')
        : selectedImports.length === 1 && state.selectedNodeIds.length === 1 ? selectedImports[0] : undefined;
      pasteImageAsset(asset, position ?? targetNode?.position ?? getFallbackPastePosition(), targetNode?.id);
    } finally {
      imageImportInFlightRef.current = false;
    }
  }, [getFallbackPastePosition, pasteImageAsset]);
}
