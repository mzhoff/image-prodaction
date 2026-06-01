'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { appendGenerationResult, getGenerationHistory, selectGenerationResult } from '@/entities/production-graph/model/generation-history';
import type { GenerationHistoryData } from '@/entities/production-graph/model/generation-history';
import { getFirstIncomingImageAsset } from '@/entities/production-graph/model/graph-io';
import type { RefineImageNodeData, RefineImageMode, RefinePreserveStrength, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { loadAssetBlob, saveImageAsset } from '@/entities/production-graph/lib/asset-db';
import { requestRefineImage } from '@/shared/api/ai-client';
import { DEFAULT_IMAGE_MODEL, MODEL_FALLBACK_ASPECT_RATIOS, MODEL_FALLBACK_SIZES } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { dataUrlToFile, prepareImageForOpenRouter } from '@/shared/lib/image-data-url';
import type { DarkSelectOption } from '@/shared/ui/dark-select';
import { getSelectedModelId, modelSelectOptions, valueSelectOptions } from '../lib/node-select-options';

export const refineModeOptions: DarkSelectOption[] = [
  { value: 'reference-cleanup', label: 'Reference cleanup' },
  { value: 'detail-boost', label: 'Detail boost' },
  { value: 'high-res-redraw', label: 'High-res redraw' },
];

export const refinePreserveStrengthOptions: DarkSelectOption[] = [
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'creative', label: 'Creative' },
];

export function useRefineImageNodeModel(node: ProductionNode) {
  const data = node.data as RefineImageNodeData;
  const [processing, setProcessing] = useState(false);
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const { imageModels, loading } = useOpenRouterModels();
  const selectedModel = getSelectedModelId(imageModels, data.model, DEFAULT_IMAGE_MODEL);
  const selectedImageModel = imageModels.find((model) => model.id === selectedModel);
  const aspectRatios = selectedImageModel?.aspectRatios?.length ? selectedImageModel.aspectRatios : MODEL_FALLBACK_ASPECT_RATIOS;
  const sizes = selectedImageModel?.sizes?.length ? selectedImageModel.sizes : MODEL_FALLBACK_SIZES;
  const selectedSize = sizes.includes(data.size) ? data.size : sizes[0];
  const sourceAsset = useMemo(() => (
    getFirstIncomingImageAsset(node.id, 'image', { edges, nodes, assets })
  ), [assets, edges, node.id, nodes]);
  const sourceAspectRatio = sourceAsset?.width && sourceAsset.height ? sourceAsset.width / sourceAsset.height : undefined;
  const selectedAspectRatio = useMemo(() => (
    getClosestAspectRatio(sourceAspectRatio, aspectRatios)
  ), [aspectRatios, sourceAspectRatio]);
  const generationHistory = useMemo(() => getGenerationHistory(data), [data]);

  useEffect(() => {
    if (!sourceAsset) {
      if (!data.sourceAssetId && data.sourceAspectRatio === undefined && !data.resultAssetIds?.length && !data.resultAssetId) return;
      updateNodeDataSilent(node.id, {
        activeResultIndex: -1,
        message: '',
        resultAssetId: undefined,
        resultAssetIds: [],
        sourceAssetId: undefined,
        sourceAspectRatio: undefined,
      });
      return;
    }

    if (data.sourceAssetId === sourceAsset.id && data.sourceAspectRatio === sourceAspectRatio) return;
    updateNodeDataSilent(node.id, {
      activeResultIndex: -1,
      message: '',
      resultAssetId: undefined,
      resultAssetIds: [],
      sourceAssetId: sourceAsset.id,
      sourceAspectRatio,
    });
  }, [
    data.resultAssetId,
    data.resultAssetIds,
    data.sourceAspectRatio,
    data.sourceAssetId,
    node.id,
    sourceAspectRatio,
    sourceAsset,
    updateNodeDataSilent,
  ]);

  const handleModelChange = useCallback((model: string) => {
    const nextModel = imageModels.find((item) => item.id === model);
    const nextSizes = nextModel?.sizes?.length ? nextModel.sizes : MODEL_FALLBACK_SIZES;
    updateNodeData(node.id, {
      model,
      size: nextSizes.includes(data.size) ? data.size : nextSizes[0],
    });
  }, [data.size, imageModels, node.id, updateNodeData]);

  const handleRefine = useCallback(async () => {
    if (!sourceAsset) {
      updateNodeData(node.id, { message: 'Подключи image output к входу Refine.' });
      return;
    }

    setProcessing(true);
    setNodeStatus(node.id, 'running');
    updateNodeDataSilent(node.id, { message: '' });
    try {
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob) throw new Error('Не удалось прочитать изображение из локального хранилища.');

      const result = await requestRefineImage({
        aspectRatio: selectedAspectRatio,
        imageDataUrl: await prepareImageForOpenRouter(sourceBlob),
        instruction: data.instruction,
        mode: data.mode,
        model: selectedModel,
        preserveStrength: data.preserveStrength,
        size: selectedSize,
      });
      const file = await dataUrlToFile(result.imageDataUrl, `refined-${Date.now()}.png`);
      const asset = await saveImageAsset(file);
      addAsset(asset);
      updateNodeData(node.id, {
        ...appendGenerationResult(data as GenerationHistoryData, asset.id),
        resultMetadata: {
          ...data.resultMetadata,
          [asset.id]: {
            aspectRatio: selectedAspectRatio,
            model: selectedModel,
            size: selectedSize,
          },
        },
        message: result.message || 'Generative refine complete.',
        model: selectedModel,
        size: selectedSize,
        sourceAssetId: sourceAsset.id,
        sourceAspectRatio,
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'OpenRouter image refine failed',
      });
      setNodeStatus(node.id, 'error');
    } finally {
      setProcessing(false);
    }
  }, [
    addAsset,
    data,
    node.id,
    selectedAspectRatio,
    selectedModel,
    selectedSize,
    setNodeStatus,
    sourceAspectRatio,
    sourceAsset,
    updateNodeData,
    updateNodeDataSilent,
  ]);

  return {
    data,
    generationHistory,
    handleInstructionChange: (instruction: string) => updateNodeData(node.id, { instruction }),
    handleModeChange: (mode: string) => updateNodeData(node.id, { mode: mode as RefineImageMode }),
    handleModelChange,
    handlePreserveStrengthChange: (preserveStrength: string) => updateNodeData(node.id, { preserveStrength: preserveStrength as RefinePreserveStrength }),
    handleRefine,
    handleResultHistoryChange: (index: number) => updateNodeDataSilent(node.id, selectGenerationResult(data as GenerationHistoryData, index)),
    handleSizeChange: (size: string) => updateNodeData(node.id, { size }),
    loading,
    modelOptions: modelSelectOptions(imageModels),
    processing,
    selectedAspectRatio,
    selectedModel,
    selectedSize,
    sizeOptions: valueSelectOptions(sizes),
    sourceAsset,
  };
}

function getClosestAspectRatio(sourceAspectRatio: number | undefined, available: string[]) {
  if (!sourceAspectRatio || available.length === 0) return available[0] ?? '1:1';
  return available.reduce((closest, candidate) => {
    const closestValue = aspectRatioValue(closest);
    const candidateValue = aspectRatioValue(candidate);
    if (!candidateValue) return closest;
    if (!closestValue) return candidate;
    return Math.abs(candidateValue - sourceAspectRatio) < Math.abs(closestValue - sourceAspectRatio)
      ? candidate
      : closest;
  }, available[0]);
}

function aspectRatioValue(value: string) {
  const [width, height] = value.split(':').map(Number);
  return width > 0 && height > 0 ? width / height : null;
}
