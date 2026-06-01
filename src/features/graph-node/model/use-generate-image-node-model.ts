'use client';

import { useMemo, useState } from 'react';
import { appendGenerationResult, getGenerationHistory, selectGenerationResult } from '@/entities/production-graph/model/generation-history';
import type { GenerateImageNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestEditImage, requestGenerateImage } from '@/shared/api/ai-client';
import { DEFAULT_IMAGE_MODEL, MODEL_FALLBACK_ASPECT_RATIOS, MODEL_FALLBACK_SIZES } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { loadAssetBlob, saveImageAsset } from '@/entities/production-graph/lib/asset-db';
import { blobToDataUrl, dataUrlToFile } from '@/shared/lib/image-data-url';
import {
  buildGeneratePayload,
  getGenerateInputKinds,
  getGenerateInputSummary,
} from '../lib/generate-node-inputs';
import { getSelectedModelId, modelSelectOptions, valueSelectOptions } from '../lib/node-select-options';

interface UseGenerateImageNodeModelParams {
  composingOpen: boolean;
  node: ProductionNode;
  onComposingOpenChange: (open: boolean) => void;
}

export function useGenerateImageNodeModel({
  composingOpen,
  node,
  onComposingOpenChange,
}: UseGenerateImageNodeModelParams) {
  const data = node.data as GenerateImageNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const updateNodePrompt = useProductionGraphStore((state) => state.updateNodePrompt);
  const { imageModels, loading } = useOpenRouterModels();
  const selectedModel = getSelectedModelId(imageModels, data.model, DEFAULT_IMAGE_MODEL);
  const selectedImageModel = imageModels.find((model) => model.id === selectedModel);
  const aspectRatios = selectedImageModel?.aspectRatios?.length ? selectedImageModel.aspectRatios : MODEL_FALLBACK_ASPECT_RATIOS;
  const sizes = selectedImageModel?.sizes?.length ? selectedImageModel.sizes : MODEL_FALLBACK_SIZES;
  const selectedAspectRatio = aspectRatios.includes(data.aspectRatio) ? data.aspectRatio : aspectRatios[0];
  const selectedSize = sizes.includes(data.size) ? data.size : sizes[0];
  const inputSummary = useMemo(() => getGenerateInputSummary(node.id, edges, nodes), [edges, node.id, nodes]);
  const generationHistory = useMemo(() => getGenerationHistory(data), [data]);
  const [promptOpen, setPromptOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const allSectionsOpen = promptOpen && settingsOpen && composingOpen;

  const toggleAllSections = () => {
    const nextOpen = !allSectionsOpen;
    setPromptOpen(nextOpen);
    setSettingsOpen(nextOpen);
    onComposingOpenChange(nextOpen);
  };

  const handleModelChange = (model: string) => {
    const nextModel = imageModels.find((item) => item.id === model);
    const nextAspectRatios = nextModel?.aspectRatios?.length ? nextModel.aspectRatios : MODEL_FALLBACK_ASPECT_RATIOS;
    const nextSizes = nextModel?.sizes?.length ? nextModel.sizes : MODEL_FALLBACK_SIZES;
    updateNodeData(node.id, {
      model,
      aspectRatio: nextAspectRatios.includes(data.aspectRatio) ? data.aspectRatio : nextAspectRatios[0],
      size: nextSizes.includes(data.size) ? data.size : nextSizes[0],
    });
  };

  const handleGenerate = async () => {
    try {
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, { message: '' });
      const payload = await buildGeneratePayload(node.id, edges, nodes, assets);
      const prompt = [...payload.promptInputs, data.prompt ?? ''].filter((item) => item.trim()).join('\n\n');
      const result = await requestGenerateImage({ ...payload, model: selectedModel, aspectRatio: selectedAspectRatio, size: selectedSize, prompt });
      const file = await dataUrlToFile(result.imageDataUrl, `generated-${Date.now()}.png`);
      const asset = await saveImageAsset(file);
      addAsset(asset);
      updateNodeData(node.id, {
        ...appendGenerationResult(data, asset.id),
        resultMetadata: {
          ...data.resultMetadata,
          [asset.id]: {
            aspectRatio: selectedAspectRatio,
            model: selectedModel,
            size: selectedSize,
          },
        },
        model: selectedModel,
        aspectRatio: selectedAspectRatio,
        size: selectedSize,
        message: result.message,
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'OpenRouter generation failed',
      });
    }
  };

  const handleMaskEdit = async ({ assetId, maskDataUrl, model, prompt }: { assetId: string; maskDataUrl: string; model: string; prompt: string }) => {
    try {
      setNodeStatus(node.id, 'running');
      const sourceAsset = assets.find((asset) => asset.id === assetId);
      if (!sourceAsset) throw new Error('Активное изображение не найдено в локальном графе.');
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob) throw new Error('Не удалось прочитать активное изображение из локального хранилища.');

      const result = await requestEditImage({
        aspectRatio: selectedAspectRatio,
        imageDataUrl: await blobToDataUrl(sourceBlob),
        maskDataUrl,
        model,
        prompt,
        size: selectedSize,
      });
      const file = await dataUrlToFile(result.imageDataUrl, `edited-${Date.now()}.png`);
      const editedAsset = await saveImageAsset(file);
      addAsset(editedAsset);
      updateNodeData(node.id, {
        ...appendGenerationResult(data, editedAsset.id),
        resultMetadata: {
          ...data.resultMetadata,
          [editedAsset.id]: {
            aspectRatio: selectedAspectRatio,
            model,
            size: selectedSize,
          },
        },
        message: result.message,
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      throw error;
    }
  };

  return {
    allSectionsOpen,
    aspectRatioOptions: valueSelectOptions(aspectRatios),
    data,
    generationHistory,
    handleGenerate,
    handleAspectRatioChange: (aspectRatio: string) => updateNodeData(node.id, { aspectRatio }),
    handleGenerationHistoryChange: (index: number) => updateNodeDataSilent(node.id, selectGenerationResult(data, index)),
    handleMaskEdit,
    handleModelChange,
    handlePromptChange: (prompt: string) => updateNodePrompt(node.id, prompt),
    handleSizeChange: (size: string) => updateNodeData(node.id, { size }),
    inputSummary,
    loading,
    modelOptions: modelSelectOptions(imageModels),
    promptOpen,
    promptState: getGenerateInputKinds(node.id, 'prompt', edges, nodes),
    referenceState: getGenerateInputKinds(node.id, 'reference', edges, nodes),
    selectedAspectRatio,
    selectedModel,
    selectedSize,
    setPromptOpen,
    setSettingsOpen,
    settingsOpen,
    sizeOptions: valueSelectOptions(sizes),
    toggleAllSections,
    getInputState: (portId: string) => getGenerateInputKinds(node.id, portId, edges, nodes),
  };
}
