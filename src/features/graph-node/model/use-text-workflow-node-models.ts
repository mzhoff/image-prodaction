'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  FORMATTED_TEXT_PRESETS,
  getFormattedTextPresetDefinition,
  normalizeFormattedTextPresetId,
} from '@/entities/production-graph/model/formatted-text';
import { getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import {
  TEXT_SPLITTER_MAX_ITEMS,
  TEXT_PROMPT_VARIABLE_MAX_INPUTS,
  getTextPromptVariablePortId,
  getTextPromptVariablePortIndex,
  getTextPromptVariables,
  getTextConcatInputCount,
  getTextConcatInputPortId,
} from '@/entities/production-graph/model/node-definitions';
import { getNodeDefinition } from '@/entities/production-graph/model/node-registry';
import type {
  ProductionNode,
  TextConcatNodeData,
  TextConcatSeparator,
  TextFormatterNodeData,
  TextGenerationNodeData,
  TextGenerationOutputStyle,
  TextGenerationReasoning,
  TextPromptNodeData,
  TextSplitterMode,
  TextSplitterNodeData,
} from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestGenerateText } from '@/shared/api/ai-client';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import type { DarkSelectOption } from '@/shared/ui/dark-select';
import { composeTextPromptResult, normalizeTextPromptVariableDisplayMode } from '../lib/text-prompt-variables';
import { getSelectedModelId, modelSelectOptions, valueSelectOptions } from '../lib/node-select-options';
import {
  getPlainTextFromTelegramRichText,
  normalizeTelegramPlainText,
  normalizeTelegramRichText,
  serializeTelegramPlainText,
} from '../lib/telegram-rich-text';
import { useTextSectionFilters } from './use-text-section-filters';

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

export const textPromptVariableDisplayOptions: DarkSelectOption[] = [
  { value: 'source-value', label: 'Source + Value' },
  { value: 'value', label: 'Value' },
  { value: 'source', label: 'Source' },
];

export const textFormatterPresetOptions: DarkSelectOption[] = FORMATTED_TEXT_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

export const TEXT_PROMPT_TEXTAREA_DEFAULT_HEIGHT = 248;
export const TEXT_PROMPT_TEXTAREA_MIN_HEIGHT = 64;
export const TEXT_PROMPT_TEXTAREA_MAX_HEIGHT = 560;
export const TEXT_FORMATTER_EDITOR_DEFAULT_HEIGHT = 360;
export const TEXT_FORMATTER_EDITOR_MIN_HEIGHT = 180;
export const TEXT_FORMATTER_EDITOR_MAX_HEIGHT = 760;
export const TEXT_CONCAT_OPTIONAL_TEXTAREA_DEFAULT_HEIGHT = 95;
export const TEXT_CONCAT_OPTIONAL_TEXTAREA_MIN_HEIGHT = 72;
export const TEXT_CONCAT_OPTIONAL_TEXTAREA_MAX_HEIGHT = 420;

export function useTextPromptNodeModel(node: ProductionNode) {
  const data = node.data as TextPromptNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const redo = useProductionGraphStore((state) => state.redo);
  const undo = useProductionGraphStore((state) => state.undo);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const variables = useMemo(() => getTextPromptVariables(node), [node]);
  const variableDisplayMode = normalizeTextPromptVariableDisplayMode(data.variableDisplayMode);
  const variableSlots = useMemo(() => variables.map((variable, index) => {
    const incomingEdge = edges.find((edge) => edge.targetNodeId === node.id && edge.targetPortId === variable.id);
    const sourceNode = incomingEdge ? nodes.find((item) => item.id === incomingEdge.sourceNodeId) : undefined;
    const sourceAlias = getCustomTextPromptSourceAlias(sourceNode);
    const incoming = getIncomingTextInputs(node.id, variable.id, { edges, nodes });
    const value = incoming.map((input) => input.text).join('\n\n');
    const connected = Boolean(incomingEdge);
    const alias = sourceAlias ?? variable.alias;
    return {
      ...variable,
      alias,
      connected,
      index,
      mentionAliases: sourceAlias && sourceAlias !== variable.alias ? [variable.alias] : undefined,
      portId: variable.id,
      sourceLabel: sourceNode?.data.title ?? incoming[0]?.sourceLabel,
      value,
    };
  }), [edges, node.id, nodes, variables]);
  const sourceCount = variableSlots.filter((slot) => slot.value.trim()).length;
  const result = useMemo(() => composeTextPromptResult(data.text, variableSlots), [data.text, variableSlots]);
  const resultSectionFilters = useTextSectionFilters({
    disabledFilterIds: data.disabledResultFilterIds,
    onDisabledFilterIdsChange: (disabledResultFilterIds) => updateNodeData(node.id, { disabledResultFilterIds }),
    text: result,
  });
  const hasVariables = variables.length > 0;
  const textareaHeight = clampTextPromptTextareaHeight(data.textareaHeight);

  useEffect(() => {
    const nextData: Partial<TextPromptNodeData> = {};
    if (data.result !== result) nextData.result = result;
    if (data.sourceCount !== sourceCount) nextData.sourceCount = sourceCount;
    if (data.textareaHeight !== textareaHeight) nextData.textareaHeight = textareaHeight;
    if (data.variableDisplayMode !== variableDisplayMode) nextData.variableDisplayMode = variableDisplayMode;
    if (!samePromptVariables(data.variables, variables)) nextData.variables = variables;
    if (Object.keys(nextData).length === 0) return;
    updateNodeDataSilent(node.id, nextData);
  }, [data.result, data.sourceCount, data.textareaHeight, data.variableDisplayMode, data.variables, node.id, result, sourceCount, textareaHeight, updateNodeDataSilent, variableDisplayMode, variables]);

  const handleAddVariable = useCallback(() => {
    if (variables.length >= TEXT_PROMPT_VARIABLE_MAX_INPUTS) return undefined;
    const usedIndexes = new Set(variables.map((variable) => getTextPromptVariablePortIndex(variable.id)));
    const nextIndex = Array.from({ length: TEXT_PROMPT_VARIABLE_MAX_INPUTS }, (_, index) => index).find((index) => !usedIndexes.has(index));
    if (typeof nextIndex !== 'number') return undefined;
    const variable = {
      id: getTextPromptVariablePortId(nextIndex),
      alias: `Variable ${nextIndex + 1}`,
    };
    updateNodeData(node.id, {
      variables: [...variables, variable],
    });
    return variable;
  }, [node.id, updateNodeData, variables]);

  return {
    canAddVariable: variables.length < TEXT_PROMPT_VARIABLE_MAX_INPUTS,
    data,
    handleAddVariable,
    handleDisplayModeChange: (value: string) => updateNodeData(node.id, { variableDisplayMode: normalizeTextPromptVariableDisplayMode(value) }),
    handleResultFilterToggle: resultSectionFilters.toggleFilter,
    handleRedo: redo,
    handleTextareaHeightChange: (nextHeight: number) => updateNodeData(node.id, { textareaHeight: clampTextPromptTextareaHeight(nextHeight) }),
    handleTextChange: (text: string) => updateNodeData(node.id, { text }),
    handleUndo: undo,
    hasVariables,
    result,
    disabledResultFilterIds: resultSectionFilters.disabledFilterIds,
    resultFilterIssues: resultSectionFilters.duplicateIssues,
    sourceCount,
    textareaHeight,
    variableDisplayMode,
    variableSlots,
    variables,
  };
}

export function useTextConcatNodeModel(node: ProductionNode) {
  const data = node.data as TextConcatNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const inputCount = getTextConcatInputCount(node);
  const optionalTextHeight = clampTextConcatOptionalHeight(data.optionalTextHeight);
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
  const resultSectionFilters = useTextSectionFilters({
    disabledFilterIds: data.disabledResultFilterIds,
    onDisabledFilterIdsChange: (disabledResultFilterIds) => updateNodeData(node.id, { disabledResultFilterIds }),
    text: result,
  });

  useEffect(() => {
    const nextData: Partial<TextConcatNodeData> = {};
    if (data.result !== result) nextData.result = result;
    if (data.sourceCount !== sourceCount) nextData.sourceCount = sourceCount;
    if (data.optionalTextHeight !== optionalTextHeight) nextData.optionalTextHeight = optionalTextHeight;
    if (Object.keys(nextData).length === 0) return;
    updateNodeDataSilent(node.id, nextData);
  }, [data.optionalTextHeight, data.result, data.sourceCount, node.id, result, sourceCount, optionalTextHeight, updateNodeDataSilent]);

  return {
    data,
    handleAddInput: () => updateNodeData(node.id, { inputCount: inputCount + 1 }),
    handleOptionalTextChange: (suffix: string) => updateNodeData(node.id, { suffix }),
    handleOptionalTextHeightChange: (nextHeight: number) => updateNodeData(node.id, { optionalTextHeight: clampTextConcatOptionalHeight(nextHeight) }),
    handleResultFilterToggle: resultSectionFilters.toggleFilter,
    inputSlots,
    optionalText: data.suffix,
    optionalTextHeight,
    result,
    disabledResultFilterIds: resultSectionFilters.disabledFilterIds,
    resultFilterIssues: resultSectionFilters.duplicateIssues,
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
  const resultSectionFilters = useTextSectionFilters({
    disabledFilterIds: data.disabledResultFilterIds,
    onDisabledFilterIdsChange: (disabledResultFilterIds) => updateNodeData(node.id, { disabledResultFilterIds }),
    text: history.activeText,
  });

  const handleGenerate = useCallback(async () => {
    const connectedPrompt = inputText.trim();
    const localPrompt = data.instruction.trim();
    const prompt = [connectedPrompt, localPrompt].filter(Boolean).join('\n\n');

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
    handleResultChange: (result: string) => updateNodeData(node.id, updateTextResult(data, result)),
    handleResultFilterToggle: resultSectionFilters.toggleFilter,
    handleTemperatureChange: (nextTemperature: number) => updateNodeData(node.id, { temperature: clampTemperature(nextTemperature) }),
    history,
    inputText,
    loading,
    modelOptions: modelSelectOptions(analysisModels),
    outputStyleOptions: textGenerationOutputStyleOptions,
    reasoning,
    reasoningOptions: textGenerationReasoningOptions,
    disabledResultFilterIds: resultSectionFilters.disabledFilterIds,
    resultFilterIssues: resultSectionFilters.duplicateIssues,
    selectedModel,
    supportsReasoning,
    supportsTemperature,
    temperature,
  };
}

export function useTextFormatterNodeModel(node: ProductionNode) {
  const data = node.data as TextFormatterNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const sourceText = useMemo(() => (
    getIncomingTextInputs(node.id, 'text', { edges, nodes }).map((input) => input.text).join('\n\n')
  ), [edges, node.id, nodes]);
  const normalizedSourceText = normalizeTelegramPlainText(sourceText);
  const presetId = normalizeFormattedTextPresetId(data.presetId);
  const preset = getFormattedTextPresetDefinition(presetId);
  const editorHeight = clampTextFormatterEditorHeight(data.editorHeight);
  const storedPlainText = normalizeTelegramPlainText(data.plainText);
  const richTextPlainText = normalizeTelegramPlainText(getPlainTextFromTelegramRichText(data.richText));
  const hasIncomingText = normalizedSourceText.length > 0;
  const shouldAdoptSourceText = hasIncomingText && normalizeTelegramPlainText(data.sourceText) !== normalizedSourceText;
  const plainText = shouldAdoptSourceText
    ? normalizedSourceText
    : storedPlainText || richTextPlainText || normalizedSourceText;
  const richText = shouldAdoptSourceText
    ? serializeTelegramPlainText(normalizedSourceText)
    : normalizeTelegramRichText(data.richText) || serializeTelegramPlainText(plainText);
  const sourceCount = hasIncomingText ? 1 : 0;

  useEffect(() => {
    const nextData: Partial<TextFormatterNodeData> = {};
    if (data.editorHeight !== editorHeight) nextData.editorHeight = editorHeight;
    if (data.presetId !== presetId) nextData.presetId = presetId;
    if (data.result !== plainText) nextData.result = plainText;
    if (data.sourceCount !== sourceCount) nextData.sourceCount = sourceCount;
    if (shouldAdoptSourceText || data.sourceText !== normalizedSourceText) nextData.sourceText = normalizedSourceText;
    if (shouldAdoptSourceText || data.plainText !== plainText) nextData.plainText = plainText;
    if (shouldAdoptSourceText || normalizeTelegramRichText(data.richText) !== richText) nextData.richText = richText;
    if (Object.keys(nextData).length === 0) return;
    updateNodeDataSilent(node.id, nextData);
  }, [data.editorHeight, data.plainText, data.presetId, data.result, data.richText, data.sourceCount, data.sourceText, editorHeight, node.id, normalizedSourceText, plainText, presetId, richText, shouldAdoptSourceText, sourceCount, updateNodeDataSilent]);

  return {
    data,
    editorHeight,
    handleEditorChange: (value: { plainText: string; richText: string }) => updateNodeData(node.id, {
      plainText: value.plainText,
      result: value.plainText,
      richText: value.richText,
      sourceText: normalizedSourceText,
    }),
    handleEditorHeightChange: (nextHeight: number) => updateNodeData(node.id, { editorHeight: clampTextFormatterEditorHeight(nextHeight) }),
    handlePresetChange: (value: string) => updateNodeData(node.id, { presetId: normalizeFormattedTextPresetId(value) }),
    hasIncomingText,
    plainText,
    preset,
    presetId,
    presetOptions: textFormatterPresetOptions,
    richText,
    sourceCount,
    sourceText: normalizedSourceText,
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

function samePromptVariables(first: TextPromptNodeData['variables'], second: NonNullable<TextPromptNodeData['variables']>) {
  if (!Array.isArray(first) || first.length !== second.length) return false;
  return first.every((variable, index) => variable.id === second[index]?.id && variable.alias === second[index]?.alias);
}

function getCustomTextPromptSourceAlias(sourceNode: ProductionNode | undefined) {
  const title = sourceNode?.data.title?.trim();
  if (!sourceNode || !title) return undefined;
  return title === getNodeDefinition(sourceNode.type).title ? undefined : title;
}

export function clampTextPromptTextareaHeight(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return TEXT_PROMPT_TEXTAREA_DEFAULT_HEIGHT;
  return Math.min(Math.max(Math.round(value), TEXT_PROMPT_TEXTAREA_MIN_HEIGHT), TEXT_PROMPT_TEXTAREA_MAX_HEIGHT);
}

export function clampTextConcatOptionalHeight(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return TEXT_CONCAT_OPTIONAL_TEXTAREA_DEFAULT_HEIGHT;
  return Math.min(Math.max(Math.round(value), TEXT_CONCAT_OPTIONAL_TEXTAREA_MIN_HEIGHT), TEXT_CONCAT_OPTIONAL_TEXTAREA_MAX_HEIGHT);
}

export function clampTextFormatterEditorHeight(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return TEXT_FORMATTER_EDITOR_DEFAULT_HEIGHT;
  return Math.min(Math.max(Math.round(value), TEXT_FORMATTER_EDITOR_MIN_HEIGHT), TEXT_FORMATTER_EDITOR_MAX_HEIGHT);
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

function updateTextResult(data: TextGenerationNodeData, text: string): Partial<TextGenerationNodeData> {
  const history = getTextHistory(data);
  const activeIndex = history.activeIndex >= 0 ? history.activeIndex : 0;
  const items = history.items.length > 0 ? [...history.items] : [''];
  items[activeIndex] = text;

  return {
    activeResultIndex: activeIndex,
    result: text,
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
