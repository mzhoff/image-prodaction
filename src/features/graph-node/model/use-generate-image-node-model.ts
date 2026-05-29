'use client';

import { useMemo, useState } from 'react';
import type { GenerateImageNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestGenerateImage } from '@/shared/api/ai-client';
import { DEFAULT_IMAGE_MODEL, MODEL_FALLBACK_ASPECT_RATIOS, MODEL_FALLBACK_SIZES } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { saveImageAsset } from '@/shared/lib/asset-db';
import { dataUrlToFile } from '@/shared/lib/image-data-url';
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
  const assignAssetToNode = useProductionGraphStore((state) => state.assignAssetToNode);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodePrompt = useProductionGraphStore((state) => state.updateNodePrompt);
  const { imageModels, loading } = useOpenRouterModels();
  const selectedModel = getSelectedModelId(imageModels, data.model, DEFAULT_IMAGE_MODEL);
  const selectedImageModel = imageModels.find((model) => model.id === selectedModel);
  const aspectRatios = selectedImageModel?.aspectRatios?.length ? selectedImageModel.aspectRatios : MODEL_FALLBACK_ASPECT_RATIOS;
  const sizes = selectedImageModel?.sizes?.length ? selectedImageModel.sizes : MODEL_FALLBACK_SIZES;
  const selectedAspectRatio = aspectRatios.includes(data.aspectRatio) ? data.aspectRatio : aspectRatios[0];
  const selectedSize = sizes.includes(data.size) ? data.size : sizes[0];
  const inputSummary = useMemo(() => getGenerateInputSummary(node.id, edges, nodes), [edges, node.id, nodes]);
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
      const payload = await buildGeneratePayload(node.id, edges, nodes, assets);
      const prompt = [...payload.promptInputs, data.prompt ?? ''].filter((item) => item.trim()).join('\n\n');
      const result = await requestGenerateImage({ ...payload, model: selectedModel, aspectRatio: selectedAspectRatio, size: selectedSize, prompt });
      const file = await dataUrlToFile(result.imageDataUrl, `generated-${Date.now()}.png`);
      const asset = await saveImageAsset(file);
      addAsset(asset);
      assignAssetToNode(node.id, asset.id);
      updateNodeData(node.id, { model: selectedModel, aspectRatio: selectedAspectRatio, size: selectedSize, message: result.message });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      window.alert(error instanceof Error ? error.message : 'OpenRouter generation failed');
    }
  };

  return {
    allSectionsOpen,
    aspectRatioOptions: valueSelectOptions(aspectRatios),
    data,
    handleGenerate,
    handleAspectRatioChange: (aspectRatio: string) => updateNodeData(node.id, { aspectRatio }),
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
