'use client';

import { useCallback, useRef } from 'react';
import type { AssetRecord, GraphPoint } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { saveUploadedImageAsset } from '@/entities/production-graph/lib/asset-db';

interface UseCanvasImageImportParams {
  getFallbackPastePosition: () => GraphPoint;
  pasteImageAsset: (asset: AssetRecord, position: GraphPoint, targetNodeId?: string) => void;
}

const IMPORT_DROP_GRID_COLUMNS = 3;
const IMPORT_DROP_GRID_GAP_X = 380;
const IMPORT_DROP_GRID_GAP_Y = 460;

export function useCanvasImageImport({
  getFallbackPastePosition,
  pasteImageAsset,
}: UseCanvasImageImportParams) {
  const imageImportInFlightRef = useRef(false);

  const importImageFiles = useCallback(async (files: readonly File[], position?: GraphPoint, targetNodeId?: string) => {
    if (imageImportInFlightRef.current) return;
    if (files.length === 0) return;
    imageImportInFlightRef.current = true;

    try {
      const assets = await Promise.all(files.map((file) => saveUploadedImageAsset(file)));
      const state = useProductionGraphStore.getState();
      const targetNode = targetNodeId
        ? state.nodes.find((node) => node.id === targetNodeId && node.type === 'importImage')
        : undefined;
      const basePosition = position ?? targetNode?.position ?? getFallbackPastePosition();

      assets.forEach((asset, index) => {
        const shouldReplaceTarget = index === 0 && Boolean(targetNode);
        pasteImageAsset(
          asset,
          getImportDropPosition(basePosition, index),
          shouldReplaceTarget ? targetNode?.id : undefined,
        );
      });
    } finally {
      imageImportInFlightRef.current = false;
    }
  }, [getFallbackPastePosition, pasteImageAsset]);

  const importImageFile = useCallback((file: File, position?: GraphPoint, targetNodeId?: string) => (
    importImageFiles([file], position, targetNodeId)
  ), [importImageFiles]);

  return { importImageFile, importImageFiles };
}

function getImportDropPosition(basePosition: GraphPoint, index: number): GraphPoint {
  return {
    x: basePosition.x + (index % IMPORT_DROP_GRID_COLUMNS) * IMPORT_DROP_GRID_GAP_X,
    y: basePosition.y + Math.floor(index / IMPORT_DROP_GRID_COLUMNS) * IMPORT_DROP_GRID_GAP_Y,
  };
}
