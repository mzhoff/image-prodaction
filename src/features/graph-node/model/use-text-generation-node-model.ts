'use client';

import { useCallback, useMemo } from 'react';
import { getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import type {
  ProductionNode,
  TextGenerationNodeData,
  TextGenerationOutputStyle,
  TextGenerationReasoning,
} from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { requestGenerateText } from '../api/ai-client';
import { getSelectedModelId, modelSelectOptions } from '../lib/node-select-options';
import { textGenerationOutputStyleOptions, textGenerationReasoningOptions } from './text-workflow-options';
import {
  appendTextResult,
  clampTemperature,
  getTextHistory,
  modelSupportsParameter,
  selectTextResult,
  updateTextResult,
} from './text-workflow-values';
import { useTextSectionFilters } from './use-text-section-filters';

export function useTextGenerationNodeModel(node: ProductionNode) {
  const data = node.data as TextGenerationNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const { analysisModels, loading } = useOpenRouterModels();
  const selectedModel = getSelectedModelId(analysisModels, data.model, DEFAULT_ANALYSIS_MODEL);
  const selectedModelOption = analysisModels.find((model) => model.id === selectedModel);
  const supportsTemperature = modelSupportsParameter(selectedModelOption?.supportedParameters, 'temperature');
  const supportsReasoning = modelSupportsParameter(selectedModelOption?.supportedParameters, 'reasoning');
  const temperature = clampTemperature(data.temperature ?? 1);
  const reasoning = data.reasoning ?? 'low';
  const inputText = useMemo(() => getIncomingTextInputs(node.id, 'text', { edges, nodes })
    .map((input) => input.text).join('\n\n'), [edges, node.id, nodes]);
  const history = getTextHistory(data);
  const filters = useTextSectionFilters({
    disabledFilterIds: data.disabledResultFilterIds,
    onDisabledFilterIdsChange: (disabledResultFilterIds) => updateNodeData(node.id, { disabledResultFilterIds }),
    text: history.activeText,
  });

  const handleGenerate = useCallback(async () => {
    const prompt = [inputText.trim(), data.instruction.trim()].filter(Boolean).join('\n\n');
    if (!prompt) {
      updateNodeData(node.id, { message: 'Добавь prompt в ноде или подключи текст ко входу Prompt.' });
      return;
    }
    try {
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, { message: '' });
      const result = await requestGenerateText({
        inputText: '',
        instruction: prompt,
        model: selectedModel,
        outputStyle: data.outputStyle,
        reasoning: supportsReasoning ? reasoning : undefined,
        temperature: supportsTemperature ? temperature : undefined,
      });
      updateNodeData(node.id, { ...appendTextResult(data, result.text), message: result.message ?? '', model: selectedModel });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      updateNodeDataSilent(node.id, { message: error instanceof Error ? error.message : 'OpenRouter text generation failed' });
    }
  }, [data, inputText, node.id, reasoning, selectedModel, setNodeStatus, supportsReasoning, supportsTemperature, temperature, updateNodeData, updateNodeDataSilent]);

  return {
    data,
    disabledResultFilterIds: filters.disabledFilterIds,
    handleGenerate,
    handleInstructionChange: (instruction: string) => updateNodeData(node.id, { instruction }),
    handleModelChange: (model: string) => updateNodeData(node.id, { model }),
    handleOutputStyleChange: (outputStyle: string) => updateNodeData(node.id, {
      outputStyle: outputStyle as TextGenerationOutputStyle,
    }),
    handleReasoningChange: (nextReasoning: string) => updateNodeData(node.id, {
      reasoning: nextReasoning as TextGenerationReasoning,
    }),
    handleResultChange: (result: string) => updateNodeData(node.id, updateTextResult(data, result)),
    handleResultFilterToggle: filters.toggleFilter,
    handleResultHistoryChange: (index: number) => updateNodeDataSilent(node.id, selectTextResult(data, index)),
    handleTemperatureChange: (value: number) => updateNodeData(node.id, { temperature: clampTemperature(value) }),
    history,
    inputText,
    loading,
    modelOptions: modelSelectOptions(analysisModels),
    outputStyleOptions: textGenerationOutputStyleOptions,
    reasoning,
    reasoningOptions: textGenerationReasoningOptions,
    resultFilterIssues: filters.duplicateIssues,
    selectedModel,
    supportsReasoning,
    supportsTemperature,
    temperature,
  };
}
