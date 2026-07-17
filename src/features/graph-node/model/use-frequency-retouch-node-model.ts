'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FrequencyRetouchNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { getFirstIncomingImageAsset } from '@/entities/production-graph/model/graph-io';
import { loadAssetBlob, saveTransientImageAsset } from '@/entities/production-graph/lib/asset-db';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { frequencyRetouchImageBlob, type FrequencyRetouchValues } from '../lib/frequency-retouch-image';

export type FrequencyRetouchControlId = keyof FrequencyRetouchValues;

export const frequencyRetouchControls: Array<{
  id: FrequencyRetouchControlId;
  label: string;
  max: number;
  min: number;
  step: number;
  valueLabel: (value: number) => string;
}> = [
  { id: 'radius', label: 'Radius', max: 32, min: 2, step: 1, valueLabel: (value) => `Radius ${value}px` },
  { id: 'toneSmoothing', label: 'Tone smooth', max: 100, min: 0, step: 1, valueLabel: (value) => `Tone ${value}%` },
  { id: 'textureAmount', label: 'Texture', max: 140, min: 0, step: 1, valueLabel: (value) => `Texture ${value}%` },
  { id: 'rednessReduction', label: 'Redness', max: 100, min: 0, step: 1, valueLabel: (value) => `Redness ${value}%` },
];

const defaultFrequencyRetouchValues: FrequencyRetouchValues = {
  radius: 8,
  rednessReduction: 20,
  textureAmount: 100,
  toneSmoothing: 45,
};

export function useFrequencyRetouchNodeModel(node: ProductionNode) {
  const data = node.data as FrequencyRetouchNodeData;
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
  const values = useMemo<FrequencyRetouchValues>(() => ({
    radius: normalizeNumber(data.radius, defaultFrequencyRetouchValues.radius),
    rednessReduction: normalizeNumber(data.rednessReduction, defaultFrequencyRetouchValues.rednessReduction),
    textureAmount: normalizeNumber(data.textureAmount, defaultFrequencyRetouchValues.textureAmount),
    toneSmoothing: normalizeNumber(data.toneSmoothing, defaultFrequencyRetouchValues.toneSmoothing),
  }), [data.radius, data.rednessReduction, data.textureAmount, data.toneSmoothing]);

  useEffect(() => {
    if (sourceAsset || (!data.maskDataUrl && !data.resultAssetId && !data.message && !data.sourceAssetId && data.sourceAspectRatio === undefined)) return;
    updateNodeDataSilent(node.id, {
      message: '',
      maskDataUrl: undefined,
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
      message: '',
      maskDataUrl: data.sourceAssetId === sourceAsset.id ? data.maskDataUrl : undefined,
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
        const file = await frequencyRetouchImageBlob(sourceBlob, values, `retouched-${Date.now()}.png`, data.maskDataUrl);
        if (processingRef.current !== runId) return;

        const asset = await saveTransientImageAsset(file);
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
          message: error instanceof Error ? error.message : 'Не удалось выполнить frequency retouch.',
        });
        setNodeStatus(node.id, 'error');
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [addAsset, data.maskDataUrl, node.id, setNodeStatus, sourceAsset, updateNodeDataSilent, values]);

  const handleRetouchStart = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  const handleRetouchChange = useCallback((id: FrequencyRetouchControlId, value: number) => {
    updateNodeDataSilent(node.id, {
      [id]: value,
      message: '',
    } as Partial<FrequencyRetouchNodeData>);
  }, [node.id, updateNodeDataSilent]);

  const handleRetouchReset = useCallback((id: FrequencyRetouchControlId) => {
    updateNodeData(node.id, {
      [id]: defaultFrequencyRetouchValues[id],
      message: '',
    } as Partial<FrequencyRetouchNodeData>);
  }, [node.id, updateNodeData]);

  const handleReset = useCallback(() => {
    updateNodeData(node.id, {
      ...defaultFrequencyRetouchValues,
      message: '',
    } as Partial<FrequencyRetouchNodeData>);
  }, [node.id, updateNodeData]);

  const handleMaskChange = useCallback((maskDataUrl: string | null) => {
    updateNodeDataSilent(node.id, {
      maskDataUrl: maskDataUrl || undefined,
      message: '',
    } as Partial<FrequencyRetouchNodeData>);
  }, [node.id, updateNodeDataSilent]);

  return {
    data,
    displayAsset: validResultAsset ?? sourceAsset,
    handleReset,
    handleMaskChange,
    handleRetouchChange,
    handleRetouchReset,
    handleRetouchStart,
    processing: node.status === 'running',
    resultAsset: validResultAsset,
    sourceAsset,
    values,
  };
}

function normalizeNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
