'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CurvesNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { getFirstIncomingImageAsset } from '@/entities/production-graph/model/graph-io';
import { loadAssetBlob, saveImageAsset } from '@/entities/production-graph/lib/asset-db';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import {
  createDefaultCurves,
  normalizeCurves,
  type CurveChannelId,
  type CurvePoint,
} from '@/shared/lib/image-renderer/curves';
import { curvesImageBlob, type CurvesAdjustmentValues } from '../lib/curves-image';

export const defaultCurvesOpacity = 100;

export function useCurvesNodeModel(node: ProductionNode) {
  const data = node.data as CurvesNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const pushHistory = useProductionGraphStore((state) => state.pushHistory);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const processingRef = useRef(0);

  const sourceAsset = useMemo(() => (
    getFirstIncomingImageAsset(node.id, 'image', { edges, nodes, assets })
  ), [assets, edges, node.id, nodes]);
  const resultAsset = useMemo(() => (
    assets.find((asset) => asset.id === data.resultAssetId)
  ), [assets, data.resultAssetId]);
  const validResultAsset = data.sourceAssetId === sourceAsset?.id ? resultAsset : undefined;
  const curves = useMemo(() => normalizeCurves(data.curves), [data.curves]);
  const activeChannel = isCurveChannel(data.activeChannel) ? data.activeChannel : 'master';
  const opacity = normalizeOpacity(data.opacity);
  const values = useMemo<CurvesAdjustmentValues>(() => ({
    curves,
    opacity,
  }), [curves, opacity]);

  useEffect(() => {
    if (sourceAsset || (!data.maskDataUrl && !data.resultAssetId && !data.message && !data.sourceAssetId && data.sourceAspectRatio === undefined)) return;
    updateNodeDataSilent(node.id, {
      maskDataUrl: undefined,
      message: '',
      resultAssetId: undefined,
      sourceAssetId: undefined,
      sourceAspectRatio: undefined,
    });
  }, [data.maskDataUrl, data.message, data.resultAssetId, data.sourceAspectRatio, data.sourceAssetId, node.id, sourceAsset, updateNodeDataSilent]);

  useEffect(() => {
    if (!sourceAsset) return;

    const sourceAspectRatio = sourceAsset.width && sourceAsset.height
      ? sourceAsset.width / sourceAsset.height
      : undefined;
    if (data.sourceAssetId === sourceAsset.id && data.sourceAspectRatio === sourceAspectRatio) return;

    updateNodeDataSilent(node.id, {
      maskDataUrl: data.sourceAssetId === sourceAsset.id ? data.maskDataUrl : undefined,
      message: '',
      resultAssetId: data.sourceAssetId === sourceAsset.id ? data.resultAssetId : undefined,
      sourceAssetId: sourceAsset.id,
      sourceAspectRatio,
    });
  }, [
    data.maskDataUrl,
    data.resultAssetId,
    data.sourceAspectRatio,
    data.sourceAssetId,
    node.id,
    sourceAsset,
    updateNodeDataSilent,
  ]);

  useEffect(() => {
    if (!sourceAsset) return undefined;

    const runId = processingRef.current + 1;
    processingRef.current = runId;
    const timer = window.setTimeout(async () => {
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob || processingRef.current !== runId) return;

      try {
        setNodeStatus(node.id, 'running');
        const file = await curvesImageBlob(sourceBlob, values, `curves-${Date.now()}.png`, data.maskDataUrl);
        if (processingRef.current !== runId) return;

        const asset = await saveImageAsset(file);
        addAsset(asset);
        updateNodeDataSilent(node.id, {
          message: '',
          resultAssetId: asset.id,
          sourceAssetId: sourceAsset.id,
          sourceAspectRatio: sourceAsset.width && sourceAsset.height ? sourceAsset.width / sourceAsset.height : undefined,
        });
        setNodeStatus(node.id, 'success');
      } catch (error) {
        if (processingRef.current !== runId) return;
        updateNodeDataSilent(node.id, {
          message: error instanceof Error ? error.message : 'Не удалось применить кривые.',
        });
        setNodeStatus(node.id, 'error');
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [addAsset, data.maskDataUrl, node.id, setNodeStatus, sourceAsset, updateNodeDataSilent, values]);

  const handleInteractionStart = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  const handleActiveChannelChange = useCallback((activeChannel: CurveChannelId) => {
    updateNodeDataSilent(node.id, { activeChannel } as Partial<CurvesNodeData>);
  }, [node.id, updateNodeDataSilent]);

  const handleCurveChange = useCallback((channel: CurveChannelId, points: CurvePoint[]) => {
    updateNodeDataSilent(node.id, {
      curves: {
        ...curves,
        [channel]: points,
      },
      message: '',
    } as Partial<CurvesNodeData>);
  }, [curves, node.id, updateNodeDataSilent]);

  const handleOpacityChange = useCallback((opacity: number) => {
    updateNodeDataSilent(node.id, {
      message: '',
      opacity,
    } as Partial<CurvesNodeData>);
  }, [node.id, updateNodeDataSilent]);

  const handleResetChannel = useCallback((channel: CurveChannelId) => {
    updateNodeData(node.id, {
      curves: {
        ...curves,
        [channel]: createDefaultCurves()[channel],
      },
      message: '',
    } as Partial<CurvesNodeData>);
  }, [curves, node.id, updateNodeData]);

  const handleReset = useCallback(() => {
    updateNodeData(node.id, {
      activeChannel: 'master',
      curves: createDefaultCurves(),
      message: '',
      opacity: defaultCurvesOpacity,
    } as Partial<CurvesNodeData>);
  }, [node.id, updateNodeData]);

  const handleMaskChange = useCallback((maskDataUrl: string | null) => {
    updateNodeDataSilent(node.id, {
      maskDataUrl: maskDataUrl || undefined,
      message: '',
    } as Partial<CurvesNodeData>);
  }, [node.id, updateNodeDataSilent]);

  return {
    activeChannel,
    curves,
    data,
    displayAsset: validResultAsset ?? sourceAsset,
    handleActiveChannelChange,
    handleCurveChange,
    handleInteractionStart,
    handleMaskChange,
    handleOpacityChange,
    handleReset,
    handleResetChannel,
    message: data.message,
    opacity,
    processing: node.status === 'running',
    resultAsset: validResultAsset,
    sourceAsset,
  };
}

function normalizeOpacity(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : defaultCurvesOpacity;
}

function isCurveChannel(value: unknown): value is CurveChannelId {
  return value === 'master' || value === 'red' || value === 'green' || value === 'blue';
}
