'use client';

import { useState } from 'react';
import type { ExtractPresetId, ImageToTextNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import {
  buildExtractPrompt,
  getExtractSelectionLabel,
  normalizeExtractPresetSelection,
} from '@/entities/production-graph/model/extract-presets';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestAnalyzeImage } from '@/shared/api/ai-client';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { loadAssetBlob } from '@/shared/lib/asset-db';
import { prepareImageForOpenRouter } from '@/shared/lib/image-data-url';
import { findIncomingImageAsset } from '../lib/generate-node-inputs';
import { getSelectedModelId, modelSelectOptions } from '../lib/node-select-options';

export function useExtractNodeModel(node: ProductionNode) {
  const data = node.data as ImageToTextNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodePrompt = useProductionGraphStore((state) => state.updateNodePrompt);
  const updateNodeResult = useProductionGraphStore((state) => state.updateNodeResult);
  const { analysisModels, loading } = useOpenRouterModels();
  const selectedModel = getSelectedModelId(analysisModels, data.model, DEFAULT_ANALYSIS_MODEL);
  const selectedPresets = normalizeExtractPresetSelection(data.presets ?? data.preset);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [promptOpen, setPromptOpen] = useState(true);
  const [resultOpen, setResultOpen] = useState(true);
  const allSectionsOpen = settingsOpen && promptOpen && resultOpen;

  const toggleAllSections = () => {
    const nextOpen = !allSectionsOpen;
    setSettingsOpen(nextOpen);
    setPromptOpen(nextOpen);
    setResultOpen(nextOpen);
  };

  const handlePresetChange = (presetIds: ExtractPresetId[]) => {
    const nextPresets = normalizeExtractPresetSelection(presetIds);
    updateNodeData(node.id, {
      preset: nextPresets[0],
      presets: nextPresets,
      prompt: buildExtractPrompt(nextPresets).systemPrompt,
    });
  };

  const handleAnalyze = async () => {
    const sourceAsset = findIncomingImageAsset(node.id, 'image', edges, nodes, assets);
    if (!sourceAsset) {
      window.alert('Подключи изображение к входу Extract или загрузи его в Import node.');
      return;
    }
    if (!data.prompt?.trim()) {
      window.alert('Выбери preset или введи prompt для Extract.');
      return;
    }

    try {
      setNodeStatus(node.id, 'running');
      const blob = await loadAssetBlob(sourceAsset);
      if (!blob) throw new Error('Не удалось прочитать загруженное изображение.');
      const imageDataUrl = await prepareImageForOpenRouter(blob);
      const result = await requestAnalyzeImage({ model: selectedModel, prompt: data.prompt, imageDataUrl });
      updateNodeData(node.id, { model: selectedModel, result });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      window.alert(error instanceof Error ? error.message : 'OpenRouter analysis failed');
    }
  };

  return {
    allSectionsOpen,
    data,
    handleAnalyze,
    handleModelChange: (model: string) => updateNodeData(node.id, { model }),
    handlePresetChange,
    handlePromptChange: (prompt: string) => updateNodePrompt(node.id, prompt),
    handleResultChange: (result: string) => updateNodeResult(node.id, result),
    loading,
    modelOptions: modelSelectOptions(analysisModels),
    promptOpen,
    resultOpen,
    selectedModel,
    selectedPresetLabel: getExtractSelectionLabel(selectedPresets),
    selectedPresets,
    setPromptOpen,
    setResultOpen,
    setSettingsOpen,
    settingsOpen,
    toggleAllSections,
  };
}
