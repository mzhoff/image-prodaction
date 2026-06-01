'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AdjustmentNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { loadAssetBlob, saveImageAsset } from '@/entities/production-graph/lib/asset-db';
import { adjustImageBlob, type ImageAdjustmentValues } from '../lib/adjust-image';
import { findIncomingImageAsset } from '../lib/generate-node-inputs';

export type AdjustmentControlId = keyof ImageAdjustmentValues;

export const adjustmentControls: Array<{
  id: AdjustmentControlId;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { id: 'exposure', label: 'Exposure', min: -100, max: 100, step: 1 },
  { id: 'gamma', label: 'Gamma', min: -100, max: 100, step: 1 },
  { id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1 },
  { id: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1 },
  { id: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1 },
  { id: 'tint', label: 'Tint', min: -100, max: 100, step: 1 },
  { id: 'highlights', label: 'Highlight', min: -100, max: 100, step: 1 },
  { id: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1 },
];

const defaultAdjustmentValues: ImageAdjustmentValues = {
  exposure: 0,
  gamma: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
};

export function useAdjustmentNodeModel(node: ProductionNode) {
  const data = node.data as AdjustmentNodeData;
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
    findIncomingImageAsset(node.id, 'image', edges, nodes, assets)
  ), [assets, edges, node.id, nodes]);
  const resultAsset = useMemo(() => (
    assets.find((asset) => asset.id === data.resultAssetId)
  ), [assets, data.resultAssetId]);
  const validResultAsset = data.sourceAssetId === sourceAsset?.id ? resultAsset : undefined;
  const values = useMemo<ImageAdjustmentValues>(() => ({
    exposure: normalizeValue(data.exposure),
    gamma: normalizeValue(data.gamma),
    contrast: normalizeValue(data.contrast),
    saturation: normalizeValue(data.saturation),
    temperature: normalizeValue(data.temperature),
    tint: normalizeValue(data.tint),
    highlights: normalizeValue(data.highlights),
    shadows: normalizeValue(data.shadows),
  }), [
    data.contrast,
    data.exposure,
    data.gamma,
    data.highlights,
    data.saturation,
    data.shadows,
    data.temperature,
    data.tint,
  ]);

  useEffect(() => {
    if (sourceAsset || (!data.resultAssetId && !data.message && !data.sourceAssetId && data.sourceAspectRatio === undefined)) return;
    updateNodeDataSilent(node.id, {
      message: '',
      resultAssetId: undefined,
      sourceAssetId: undefined,
      sourceAspectRatio: undefined,
    });
  }, [data.message, data.resultAssetId, data.sourceAspectRatio, data.sourceAssetId, node.id, sourceAsset, updateNodeDataSilent]);

  useEffect(() => {
    if (!sourceAsset) return;

    const sourceAspectRatio = sourceAsset.width && sourceAsset.height
      ? sourceAsset.width / sourceAsset.height
      : undefined;
    if (data.sourceAssetId === sourceAsset.id && data.sourceAspectRatio === sourceAspectRatio) return;

    updateNodeDataSilent(node.id, {
      message: '',
      resultAssetId: data.sourceAssetId === sourceAsset.id ? data.resultAssetId : undefined,
      sourceAssetId: sourceAsset.id,
      sourceAspectRatio,
    });
  }, [
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
        const file = await adjustImageBlob(sourceBlob, values, `adjusted-${Date.now()}.png`);
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
          message: error instanceof Error ? error.message : 'Не удалось применить коррекцию.',
        });
        setNodeStatus(node.id, 'error');
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [addAsset, node.id, setNodeStatus, sourceAsset, updateNodeDataSilent, values]);

  const handleAdjustmentStart = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  const handleAdjustmentChange = useCallback((id: AdjustmentControlId, value: number) => {
    updateNodeDataSilent(node.id, {
      [id]: value,
      message: '',
    } as Partial<AdjustmentNodeData>);
  }, [node.id, updateNodeDataSilent]);

  const handleAdjustmentReset = useCallback((id: AdjustmentControlId) => {
    updateNodeData(node.id, {
      [id]: 0,
      message: '',
    } as Partial<AdjustmentNodeData>);
  }, [node.id, updateNodeData]);

  const handleReset = useCallback(() => {
    updateNodeData(node.id, {
      ...defaultAdjustmentValues,
      message: '',
    } as Partial<AdjustmentNodeData>);
  }, [node.id, updateNodeData]);

  return {
    data,
    displayAsset: validResultAsset ?? sourceAsset,
    handleAdjustmentChange,
    handleAdjustmentReset,
    handleAdjustmentStart,
    handleReset,
    message: data.message,
    resultAsset: validResultAsset,
    sourceAsset,
    values,
  };
}

function normalizeValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
