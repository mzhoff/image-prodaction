'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import {
  TEXT_SPLITTER_MAX_ITEMS,
  getTextConcatInputCount,
  getTextConcatInputPortId,
} from '@/entities/production-graph/model/node-definitions';
import type {
  ProductionNode,
  TextConcatNodeData,
  TextConcatSeparator,
  TextGenerationNodeData,
  TextGenerationOutputStyle,
  TextGenerationReasoning,
  TextSplitterMode,
  TextSplitterNodeData,
} from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestGenerateText } from '@/shared/api/ai-client';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import type { DarkSelectOption } from '@/shared/ui/dark-select';
import { getSelectedModelId, modelSelectOptions, valueSelectOptions } from '../lib/node-select-options';

export const textConcatSeparatorOptions: DarkSelectOption[] = [
  { value: 'double-newline', label: 'Double newline' },
  { value: 'newline', label: 'Newline' },
  { value: 'space', label: 'Space' },
  { value: 'custom', label: 'Custom' },
];

export const textGenerationOutputStyleOptions: DarkSelectOption[] = [
  { value: 'plain', label: 'Plain text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'numbered-list', label: 'Numbered list' },
];

export const textGenerationReasoningOptions: DarkSelectOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const textSplitterModeOptions: DarkSelectOption[] = [
  { value: 'numbered-list', label: 'Numbered list' },
  { value: 'newline', label: 'Newline' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'delimiter', label: 'Delimiter' },
];

export function useTextConcatNodeModel(node: ProductionNode) {
  const data = node.data as TextConcatNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const inputCount = getTextConcatInputCount(node);
  const inputSlots = useMemo(() => (
    Array.from({ length: inputCount }, (_, index) => {
      const portId = getTextConcatInputPortId(index);
      const incoming = getIncomingTextInputs(node.id, portId, { edges, nodes });
      return {
        connected: edges.some((edge) => edge.targetNodeId === node.id && edge.targetPortId === portId),
        index,
        portId,
        text: incoming.map((input) => input.text).join('\n\n'),
      };
    })
  ), [edges, inputCount, node.id, nodes]);
  const sourceCount = inputSlots.filter((slot) => slot.text.trim()).length;
  const result = useMemo(() => composeConcatText(data, inputSlots.map((input) => input.text)), [data, inputSlots]);

  useEffect(() => {
    if (data.result === result && data.sourceCount === sourceCount) return;
    updateNodeDataSilent(node.id, { result, sourceCount });
  }, [data.result, data.sourceCount, node.id, result, sourceCount, updateNodeDataSilent]);

  return {
    data,
    handleAddInput: () => updateNodeData(node.id, { inputCount: inputCount + 1 }),
    handleOptionalTextChange: (suffix: string) => updateNodeData(node.id, { suffix }),
    inputSlots,
    optionalText: data.suffix,
    result,
    sourceCount,
  };
}

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
  const inputText = useMemo(() => (
    getIncomingTextInputs(node.id, 'text', { edges, nodes }).map((input) => input.text).join('\n\n')
  ), [edges, node.id, nodes]);
  const history = getTextHistory(data);

  const handleGenerate = useCallback(async () => {
    if (!inputText.trim()) {
      updateNodeData(node.id, { message: 'Подключи text output ко входу Text Gen.' });
      return;
    }
    if (!data.instruction.trim()) {
      updateNodeData(node.id, { message: 'Добавь инструкцию для генерации текста.' });
      return;
    }

    try {
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, { message: '' });
      const result = await requestGenerateText({
        inputText,
        instruction: data.instruction,
        model: selectedModel,
        outputStyle: data.outputStyle,
        reasoning: supportsReasoning ? reasoning : undefined,
        temperature: supportsTemperature ? temperature : undefined,
      });
      updateNodeData(node.id, {
        ...appendTextResult(data, result.text),
        message: result.message ?? '',
        model: selectedModel,
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'OpenRouter text generation failed',
      });
    }
  }, [data, inputText, node.id, reasoning, selectedModel, setNodeStatus, supportsReasoning, supportsTemperature, temperature, updateNodeData, updateNodeDataSilent]);

  return {
    data,
    handleGenerate,
    handleInstructionChange: (instruction: string) => updateNodeData(node.id, { instruction }),
    handleModelChange: (model: string) => updateNodeData(node.id, { model }),
    handleOutputStyleChange: (outputStyle: string) => updateNodeData(node.id, { outputStyle: outputStyle as TextGenerationOutputStyle }),
    handleReasoningChange: (nextReasoning: string) => updateNodeData(node.id, { reasoning: nextReasoning as TextGenerationReasoning }),
    handleResultHistoryChange: (index: number) => updateNodeDataSilent(node.id, selectTextResult(data, index)),
    handleTemperatureChange: (nextTemperature: number) => updateNodeData(node.id, { temperature: clampTemperature(nextTemperature) }),
    history,
    inputText,
    loading,
    modelOptions: modelSelectOptions(analysisModels),
    outputStyleOptions: textGenerationOutputStyleOptions,
    reasoning,
    reasoningOptions: textGenerationReasoningOptions,
    selectedModel,
    supportsReasoning,
    supportsTemperature,
    temperature,
  };
}

export function useTextSplitterNodeModel(node: ProductionNode) {
  const data = node.data as TextSplitterNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const addNode = useProductionGraphStore((state) => state.addNode);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const updateTextPrompt = useProductionGraphStore((state) => state.updateTextPrompt);
  const sourceText = useMemo(() => (
    getIncomingTextInputs(node.id, 'text', { edges, nodes }).map((input) => input.text).join('\n\n')
  ), [edges, node.id, nodes]);
  const items = useMemo(() => splitText(sourceText, data.mode, data.delimiter), [data.delimiter, data.mode, sourceText]);
  const visibleItems = items.slice(0, TEXT_SPLITTER_MAX_ITEMS);
  const message = items.length > TEXT_SPLITTER_MAX_ITEMS
    ? `Text Split produced ${items.length} fragments. Limit is ${TEXT_SPLITTER_MAX_ITEMS}; use another splitter node for the remaining text.`
    : '';
  const activeItemIndex = clampIndex(data.activeItemIndex ?? 0, visibleItems.length);
  const result = visibleItems[activeItemIndex] ?? '';

  useEffect(() => {
    if (data.sourceText === sourceText && arraysEqual(data.items ?? [], visibleItems) && data.result === result && data.activeItemIndex === activeItemIndex && data.message === message) return;
    updateNodeDataSilent(node.id, { activeItemIndex, items: visibleItems, message, result, sourceText });
  }, [activeItemIndex, data.activeItemIndex, data.items, data.message, data.result, data.sourceText, message, node.id, result, sourceText, updateNodeDataSilent, visibleItems]);

  const handleCreateTextNodes = useCallback(() => {
    visibleItems.slice(0, 12).forEach((item, index) => {
      const nodeId = addNode('textPrompt', {
        x: node.position.x + 430,
        y: node.position.y + index * 260,
      });
      updateTextPrompt(nodeId, item);
    });
  }, [addNode, node.position.x, node.position.y, updateTextPrompt, visibleItems]);

  return {
    activeItemIndex,
    data,
    handleActiveItemChange: (value: string) => updateNodeData(node.id, { activeItemIndex: Number(value) }),
    handleCreateTextNodes,
    handleDelimiterChange: (delimiter: string) => updateNodeData(node.id, { delimiter }),
    handleModeChange: (mode: string) => updateNodeData(node.id, { mode: mode as TextSplitterMode }),
    handleSplitRuleChange: (delimiter: string) => updateNodeData(node.id, { delimiter, mode: 'delimiter' }),
    itemOptions: valueSelectOptions(visibleItems.map((_, index) => String(index))),
    items: visibleItems,
    message,
    modeOptions: textSplitterModeOptions,
    result,
    sourceText,
  };
}

function composeConcatText(data: TextConcatNodeData, parts: string[]) {
  const separator = getSeparator(data.separator, data.customSeparator);
  return [
    parts.map((part) => part.trim()).filter(Boolean).join(separator),
    data.suffix.trim(),
  ].filter(Boolean).join(separator);
}

function getSeparator(separator: TextConcatSeparator, customSeparator: string) {
  if (separator === 'newline') return '\n';
  if (separator === 'space') return ' ';
  if (separator === 'custom') return customSeparator || '\n\n';
  return '\n\n';
}

function getTextHistory(data: TextGenerationNodeData) {
  const items = uniqueTexts([...(data.resultTexts ?? []), data.result]);
  if (items.length === 0) return { activeIndex: -1, activeText: '', items };
  const activeIndex = clampIndex(data.activeResultIndex ?? items.length - 1, items.length);
  return { activeIndex, activeText: items[activeIndex] ?? '', items };
}

function appendTextResult(data: TextGenerationNodeData, text: string): Partial<TextGenerationNodeData> {
  const items = uniqueTexts([...getTextHistory(data).items, text]);
  const activeIndex = items.length - 1;
  return {
    activeResultIndex: activeIndex,
    result: items[activeIndex],
    resultTexts: items,
  };
}

function selectTextResult(data: TextGenerationNodeData, index: number): Partial<TextGenerationNodeData> {
  const items = getTextHistory(data).items;
  if (items.length === 0) return { activeResultIndex: -1, result: '', resultTexts: [] };
  const activeIndex = clampIndex(index, items.length);
  return {
    activeResultIndex: activeIndex,
    result: items[activeIndex],
    resultTexts: items,
  };
}

function splitText(text: string, mode: TextSplitterMode, delimiter: string) {
  const source = text.trim();
  if (!source) return [];
  if (mode === 'paragraph') return source.split(/\n\s*\n+/).map(cleanItem).filter(Boolean);
  if (mode === 'delimiter') return source.split(delimiter || '---').map(cleanItem).filter(Boolean);
  if (mode === 'newline') return source.split(/\n+/).map(cleanItem).filter(Boolean);
  return source.split(/\n+/).map((line) => line.replace(/^\s*(?:\d+[\).:-]|[-*])\s+/, '')).map(cleanItem).filter(Boolean);
}

function cleanItem(value: string) {
  return value.trim();
}

function clampTemperature(value: number) {
  return Math.min(2, Math.max(0, Math.round(value * 10) / 10));
}

function modelSupportsParameter(parameters: string[] | undefined, parameter: string) {
  return Boolean(parameters?.includes(parameter));
}

function uniqueTexts(items: Array<string | undefined>) {
  return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return -1;
  return Math.min(Math.max(index, 0), length - 1);
}

function arraysEqual(first: string[], second: string[]) {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}
