'use client';

import { useState } from 'react';
import type { ExtractPresetId, ImageToTextNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { extractAnalysisPresets, normalizeExtractAnalysisPreset, type ExtractLayerId } from '@/entities/production-graph/model/extract-analysis-profiles';
import { extractLayerTextSectionParseOptions } from '@/entities/production-graph/model/extract-layer-parser';
import {
  buildExtractPrompt,
  getExtractSelectionLabel,
  getExtractLayerOptions,
  normalizeExtractPresetSelection,
} from '@/entities/production-graph/model/extract-presets';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestAnalyzeImage } from '../api/ai-client';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import { getIncomingImageInputs } from '@/entities/production-graph/model/graph-io';
import { prepareImageForOpenRouter } from '@/shared/lib/image-data-url';
import { getSelectedModelId, modelSelectOptions } from '../lib/node-select-options';
import { useTextSectionFilters } from './use-text-section-filters';
import { getExtractAnalysisPresetPatch } from './extract-analysis-preset-state';

const analysisPresetOptions = extractAnalysisPresets.map(({ id, label }) => ({ value: id, label }));

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
  const selectedAnalysisPreset = normalizeExtractAnalysisPreset(data.analysisPreset);
  const selectedPresets = normalizeExtractPresetSelection(data.presets ?? data.preset, selectedAnalysisPreset);
  const layerSectionFilters = useTextSectionFilters({
    disabledFilterIds: data.disabledLayerIds,
    onDisabledFilterIdsChange: (disabledLayerIds) => updateNodeData(node.id, { disabledLayerIds: disabledLayerIds as ExtractLayerId[] }),
    parseOptions: extractLayerTextSectionParseOptions,
    text: data.result,
  });
  const disabledLayerIds = layerSectionFilters.disabledFilterIds as ExtractLayerId[];
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [promptOpen, setPromptOpen] = useState(true);
  const [resultOpen, setResultOpen] = useState(true);

  const handlePresetChange = (presetIds: ExtractPresetId[]) => {
    if (node.status === 'running') return;
    const nextPresets = normalizeExtractPresetSelection(presetIds, selectedAnalysisPreset);
    updateNodeData(node.id, {
      preset: nextPresets[0],
      presets: nextPresets,
      prompt: buildExtractPrompt(nextPresets, selectedAnalysisPreset).systemPrompt,
    });
  };

  const handleAnalysisPresetChange = (value: string) => {
    if (node.status === 'running') return;
    const patch = getExtractAnalysisPresetPatch(data, value);
    if (patch) updateNodeData(node.id, patch);
  };

  const handleAnalyze = async () => {
    if (useProductionGraphStore.getState().nodes.find((item) => item.id === node.id)?.status === 'running') return;
    const sourceAssets = getIncomingImageInputs(node.id, undefined, { edges, nodes, assets }).slice(0, 5);
    if (sourceAssets.length === 0) {
      updateNodeData(node.id, { message: 'Подключи изображение к входу Extract или загрузи его в Import node.' });
      return;
    }
    if (!data.prompt?.trim()) {
      updateNodeData(node.id, { message: 'Выбери слои в Layers или введи промпт для Extract.' });
      return;
    }

    try {
      setNodeStatus(node.id, 'running');
      updateNodeData(node.id, { message: '' });
      const imageDataUrls = await Promise.all(sourceAssets.map(async ({ asset }) => {
        const blob = await loadAssetBlob(asset);
        if (!blob) throw new Error(`Не удалось прочитать изображение «${asset.name}».`);
        return prepareImageForOpenRouter(blob);
      }));
      const result = await requestAnalyzeImage({ analysisPreset: selectedAnalysisPreset, model: selectedModel, prompt: data.prompt, imageDataUrls });
      updateNodeData(node.id, { message: '', model: selectedModel, result });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      updateNodeData(node.id, { message: error instanceof Error ? error.message : 'OpenRouter analysis failed' });
    }
  };

  return {
    data,
    analysisPresetOptions,
    disabledLayerIds,
    handleAnalysisPresetChange,
    handleAnalyze,
    handleLayerToggle: (layerId: ExtractLayerId) => layerSectionFilters.toggleFilter(layerId),
    handleModelChange: (model: string) => { if (node.status !== 'running') updateNodeData(node.id, { model }); },
    handlePresetChange,
    handlePromptChange: (prompt: string) => updateNodePrompt(node.id, prompt),
    handleResultChange: (result: string) => updateNodeResult(node.id, result),
    loading,
    layerOptions: getExtractLayerOptions(selectedAnalysisPreset),
    modelOptions: modelSelectOptions(analysisModels),
    promptOpen,
    resultOpen,
    selectedModel,
    selectedAnalysisPreset,
    selectedPresetLabel: getExtractSelectionLabel(selectedPresets, selectedAnalysisPreset),
    selectedPresets,
    setPromptOpen,
    setResultOpen,
    setSettingsOpen,
    settingsOpen,
  };
}
