'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetRecord, GraphPoint, ImportImageNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { saveImportedMediaAsset } from '@/entities/production-graph/lib/import-media-asset';
import { getActiveAssetScopeSnapshot, subscribeActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { getImportMediaKind } from '@/shared/lib/import-media-file';
import { collectCanvasImports, createCanvasImportProgress, type CanvasImportProgress } from './canvas-import-progress';

interface UseCanvasImageImportParams {
  getFallbackPastePosition: () => GraphPoint;
  pasteImageAsset: (asset: AssetRecord, position: GraphPoint, targetNodeId?: string) => void;
  showToast: (message: string) => void;
}

const IMPORT_DROP_GRID_COLUMNS = 3;
const IMPORT_DROP_GRID_GAP_X = 380;
const IMPORT_DROP_GRID_GAP_Y = 460;

export function useCanvasImageImport({
  getFallbackPastePosition,
  pasteImageAsset,
  showToast,
}: UseCanvasImageImportParams) {
  const tUi = useTranslations();
  const imageImportInFlightRef = useRef(false);
  const generation = useRef(0);
  const [importProgressStore] = useState(createCanvasImportProgress);

  useEffect(() => {
    const clear = () => {
      generation.current++;
      importProgressStore.setState({ progress: null });
    };
    const unsubscribe = subscribeActiveAssetScope(clear);
    return () => { unsubscribe(); clear(); };
  }, [importProgressStore]);

  const importImageFiles = useCallback(async (files: readonly File[], position?: GraphPoint, targetNodeId?: string) => {
    if (imageImportInFlightRef.current) {
      showToast(tUi("Импорт уже идёт. Дождитесь завершения текущей загрузки."));
      return;
    }
    if (files.length === 0) return;
    imageImportInFlightRef.current = true;

    try {
      const scope = getActiveAssetScopeSnapshot();
      const currentGeneration = generation.current;
      const isCurrent = () => generation.current === currentGeneration && getActiveAssetScopeSnapshot() === scope;
      const original = useProductionGraphStore.getState();
      const target = original.nodes.find((node) => node.id === targetNodeId && node.type === 'importImage');
      if (target && ((target.data as ImportImageNodeData).mediaKind ?? 'image') !== getImportMediaKind(files[0]!)
        && original.edges.some((edge) => edge.sourceNodeId === target.id)
        && !window.confirm('Changing media type removes incompatible connections. Continue?')) return;
      importProgressStore.setState({ progress: {
        phase: 'preparing', total: files.length, completed: 0, failed: 0,
        imagesOnly: files.every((file) => getImportMediaKind(file) === 'image'),
      } });
      const update = (patch: Partial<CanvasImportProgress>) => importProgressStore.setState((state) => (
        { progress: state.progress ? { ...state.progress, ...patch } : null }
      ));
      // Keep conversion/upload sequential to bound memory for iPhone photo batches and videos.
      const assets = await collectCanvasImports({ files, isCurrent, update,
        save: (file, onStage) => saveImportedMediaAsset(file, scope, onStage) });
      if (!assets || !isCurrent()) return;
      const state = useProductionGraphStore.getState();
      const targetNode = targetNodeId
        ? state.nodes.find((node) => node.id === targetNodeId && node.type === 'importImage')
        : undefined;
      const basePosition = position ?? targetNode?.position ?? getFallbackPastePosition();

      update({ phase: 'adding', fileName: undefined });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!isCurrent()) return;
      if (assets.length) useProductionGraphStore.getState().runInHistoryBatch(() => {
        assets.forEach(({ asset, index }) => {
          const shouldReplaceTarget = index === 0 && Boolean(targetNode);
          pasteImageAsset(asset, getImportDropPosition(basePosition, index), shouldReplaceTarget ? targetNode?.id : undefined);
        });
      });
      update({ phase: 'done' });
    } finally {
      imageImportInFlightRef.current = false;
    }
  }, [tUi, getFallbackPastePosition, importProgressStore, pasteImageAsset, showToast]);

  const importImageFile = useCallback((file: File, position?: GraphPoint, targetNodeId?: string) => (
    importImageFiles([file], position, targetNodeId)
  ), [importImageFiles]);

  return { importImageFile, importImageFiles, importProgressStore };
}

function getImportDropPosition(basePosition: GraphPoint, index: number): GraphPoint {
  return {
    x: basePosition.x + (index % IMPORT_DROP_GRID_COLUMNS) * IMPORT_DROP_GRID_GAP_X,
    y: basePosition.y + Math.floor(index / IMPORT_DROP_GRID_COLUMNS) * IMPORT_DROP_GRID_GAP_Y,
  };
}
