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
import { saveAssetBlob } from '@/entities/production-graph/lib/asset-db';
import type {
  ProductionNode,
  TextConcatNodeData,
  TextConcatSeparator,
  TextFormatterNodeData,
  TextGenerationNodeData,
  TextGenerationOutputStyle,
  TextGenerationReasoning,
  TextToSpeechLanguage,
  TextToSpeechNodeData,
  TextToSpeechResponseFormat,
  TextPromptNodeData,
  TextSplitterMode,
  TextSplitterNodeData,
} from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestGenerateSpeech, requestGenerateText } from '@/shared/api/ai-client';
import { DEFAULT_ANALYSIS_MODEL, DEFAULT_SPEECH_MODEL } from '@/shared/api/openrouter-models';
import { getOpenRouterSpeechCapabilities, getSafeSpeechResponseFormat, getSafeSpeechVoice } from '@/shared/api/openrouter-speech-capabilities';
import { getPlainTextFromArticleRichText, normalizeArticleRichText } from '@/shared/editor-core';
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

export const textToSpeechLanguageOptions: DarkSelectOption[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'ru', label: 'Russian' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'zh', label: 'Chinese' },
];

const textToSpeechResponseFormatLabels: Record<TextToSpeechResponseFormat, string> = {
  mp3: 'MP3',
  pcm: 'PCM',
};

export const textFormatterPresetOptions: DarkSelectOption[] = FORMATTED_TEXT_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

export const TEXT_PROMPT_TEXTAREA_DEFAULT_HEIGHT = 248;
export const TEXT_PROMPT_TEXTAREA_MIN_HEIGHT = 64;
export const TEXT_PROMPT_TEXTAREA_MAX_HEIGHT = 560;
export const TEXT_FORMATTER_EDITOR_DEFAULT_HEIGHT = 260;
export const TEXT_FORMATTER_EDITOR_MIN_HEIGHT = 180;
export const TEXT_FORMATTER_EDITOR_MAX_HEIGHT = 2400;
export const TEXT_FORMATTER_NODE_DEFAULT_WIDTH = 400;
export const TEXT_FORMATTER_NODE_MIN_WIDTH = 400;
export const TEXT_FORMATTER_NODE_MAX_WIDTH = 800;
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

export function useTextToSpeechNodeModel(node: ProductionNode) {
  const data = node.data as TextToSpeechNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const { loading, speechModels } = useOpenRouterModels();
  const selectedModel = getSelectedModelId(speechModels, data.model, DEFAULT_SPEECH_MODEL);
  const capabilities = getOpenRouterSpeechCapabilities(selectedModel);
  const language = normalizeTextToSpeechLanguage(data.language);
  const voiceOptions = getTextToSpeechVoiceOptions(selectedModel, data.voice);
  const selectedVoice = getSafeSpeechVoice(selectedModel, data.voice, language);
  const responseFormat = getSafeSpeechResponseFormat(selectedModel, data.responseFormat);
  const responseFormatOptions = capabilities.formats.map((format) => ({ value: format, label: textToSpeechResponseFormatLabels[format] }));
  const speed = clampSpeechSpeed(data.speed ?? 1);
  const temperature = clampTemperature(data.temperature ?? 1);
  const topP = clampTopP(data.topP ?? 1);
  const seed = typeof data.seed === 'number' && Number.isInteger(data.seed) ? data.seed : undefined;
  const inputText = useMemo(() => (
    getIncomingTextInputs(node.id, 'text', { edges, nodes }).map((input) => input.text).join('\n\n')
  ), [edges, node.id, nodes]);
  const effectiveText = inputText.trim() || data.localText?.trim() || '';
  const history = getSpeechHistory(data);
  const activeAssetId = history.activeAssetId;
  const activeMetadata = activeAssetId ? data.resultMetadata?.[activeAssetId] : undefined;

  useEffect(() => {
    const nextData: Partial<TextToSpeechNodeData> = {};
    if (data.sourceText !== inputText) nextData.sourceText = inputText;
    if (data.language !== language) nextData.language = language;
    if (data.responseFormat !== responseFormat) nextData.responseFormat = responseFormat;
    if (data.speed !== speed) nextData.speed = speed;
    if (data.voice !== selectedVoice) nextData.voice = selectedVoice;
    if (Object.keys(nextData).length === 0) return;
    updateNodeDataSilent(node.id, nextData);
  }, [data.language, data.responseFormat, data.sourceText, data.speed, data.voice, inputText, language, node.id, responseFormat, selectedVoice, speed, updateNodeDataSilent]);

  const handleGenerate = useCallback(async () => {
    const text = effectiveText.trim();
    if (!text) {
      updateNodeData(node.id, { message: 'Подключи текст ко входу Text или добавь текст в поле ноды.' });
      return;
    }

    const resolvedLanguage = language === 'auto' ? detectSpeechLanguage(text) : language;

    try {
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, { message: '' });
      const result = await requestGenerateSpeech({
        inputText: text,
        language: resolvedLanguage,
        model: selectedModel,
        responseFormat,
        seed: capabilities.supportsSeed ? seed : undefined,
        speed: capabilities.supportsSpeed ? speed : undefined,
        temperature: capabilities.supportsTemperature ? temperature : undefined,
        topP: capabilities.supportsTopP ? topP : undefined,
        voice: selectedVoice,
      });
      const extension = result.mimeType.includes('wav') ? 'wav' : responseFormat === 'mp3' ? 'mp3' : 'pcm';
      const asset = await saveAssetBlob(result.blob, {
        kind: 'audio',
        mimeType: result.mimeType,
        name: `voice-${Date.now()}.${extension}`,
      });
      addAsset(asset);
      updateNodeData(node.id, appendSpeechResult(data, asset.id, {
        createdAt: asset.createdAt,
        generationId: result.generationId,
        language: resolvedLanguage,
        mimeType: result.mimeType,
        model: selectedModel,
        sizeBytes: result.blob.size,
        voice: selectedVoice,
      }));
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'OpenRouter speech generation failed',
      });
    }
  }, [addAsset, capabilities.supportsSeed, capabilities.supportsSpeed, capabilities.supportsTemperature, capabilities.supportsTopP, data, effectiveText, language, node.id, responseFormat, seed, selectedModel, selectedVoice, setNodeStatus, speed, temperature, topP, updateNodeData, updateNodeDataSilent]);

  return {
    activeAssetId,
    activeMetadata,
    data,
    effectiveText,
    handleGenerate,
    handleLanguageChange: (nextLanguage: string) => updateNodeData(node.id, { language: normalizeTextToSpeechLanguage(nextLanguage) }),
    handleLocalTextChange: (localText: string) => updateNodeData(node.id, { localText }),
    handleModelChange: (model: string) => updateNodeData(node.id, {
      model,
      responseFormat: getSafeSpeechResponseFormat(model, data.responseFormat),
      voice: getSafeSpeechVoice(model, data.voice, language),
    }),
    handleResponseFormatChange: (value: string) => updateNodeData(node.id, { responseFormat: getSafeSpeechResponseFormat(selectedModel, value === 'pcm' ? 'pcm' : 'mp3') }),
    handleResultHistoryChange: (index: number) => updateNodeDataSilent(node.id, selectSpeechResult(data, index)),
    handleSeedChange: (nextSeed: string) => updateNodeData(node.id, { seed: parseOptionalInteger(nextSeed) }),
    handleSpeedChange: (nextSpeed: number) => updateNodeData(node.id, { speed: clampSpeechSpeed(nextSpeed) }),
    handleTemperatureChange: (nextTemperature: number) => updateNodeData(node.id, { temperature: clampTemperature(nextTemperature) }),
    handleTopPChange: (nextTopP: number) => updateNodeData(node.id, { topP: clampTopP(nextTopP) }),
    handleVoiceChange: (voice: string) => updateNodeData(node.id, { voice }),
    history,
    inputText,
    language,
    languageOptions: textToSpeechLanguageOptions,
    loading,
    modelOptions: modelSelectOptions(speechModels),
    responseFormat,
    responseFormatOptions,
    seed,
    selectedModel,
    selectedVoice,
    showFormat: Boolean(capabilities.supportsResponseFormat) && responseFormatOptions.length > 1,
    showSeed: Boolean(capabilities.supportsSeed),
    showSpeed: Boolean(capabilities.supportsSpeed),
    showTemperature: Boolean(capabilities.supportsTemperature),
    showTopP: Boolean(capabilities.supportsTopP),
    speed,
    temperature,
    topP,
    voiceOptions,
  };
}

export function useTextFormatterNodeModel(node: ProductionNode) {
  const data = node.data as TextFormatterNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const resizeNode = useProductionGraphStore((state) => state.resizeNode);
  const sourceText = useMemo(() => (
    getIncomingTextInputs(node.id, 'text', { edges, nodes }).map((input) => input.text).join('\n\n')
  ), [edges, node.id, nodes]);
  const normalizedSourceText = normalizeTelegramPlainText(sourceText);
  const presetId = normalizeFormattedTextPresetId(data.presetId);
  const preset = getFormattedTextPresetDefinition(presetId);
  const usesArticleEditor = presetId === 'markdown' || presetId === 'blog-article' || presetId === 'universal';
  const shouldParseMarkdown = presetId === 'markdown';
  const editorHeight = clampTextFormatterEditorHeight(data.editorHeight);
  const storedPlainText = normalizeTelegramPlainText(data.plainText);
  const normalizedStoredRichText = usesArticleEditor ? normalizeArticleRichText(data.richText) : normalizeTelegramRichText(data.richText);
  const richTextPlainText = normalizeTelegramPlainText(usesArticleEditor ? getPlainTextFromArticleRichText(data.richText) : getPlainTextFromTelegramRichText(data.richText));
  const hasIncomingText = normalizedSourceText.length > 0;
  const shouldAdoptSourceText = hasIncomingText && normalizeTelegramPlainText(data.sourceText) !== normalizedSourceText;
  const plainText = shouldAdoptSourceText
    ? normalizedSourceText
    : storedPlainText || richTextPlainText || normalizedSourceText;
  const richText = shouldAdoptSourceText
    ? shouldParseMarkdown ? '' : serializeTelegramPlainText(normalizedSourceText)
    : normalizedStoredRichText || (usesArticleEditor ? '' : serializeTelegramPlainText(plainText));
  const sourceCount = hasIncomingText ? 1 : 0;

  useEffect(() => {
    const nextData: Partial<TextFormatterNodeData> = {};
    if (data.editorHeight !== editorHeight) nextData.editorHeight = editorHeight;
    if (data.presetId !== presetId) nextData.presetId = presetId;
    if (data.result !== plainText) nextData.result = plainText;
    if (data.sourceCount !== sourceCount) nextData.sourceCount = sourceCount;
    if (shouldAdoptSourceText || data.sourceText !== normalizedSourceText) nextData.sourceText = normalizedSourceText;
    if (shouldAdoptSourceText || data.plainText !== plainText) nextData.plainText = plainText;
    if (shouldAdoptSourceText || normalizedStoredRichText !== richText) nextData.richText = richText;
    if (Object.keys(nextData).length === 0) return;
    updateNodeDataSilent(node.id, nextData);
  }, [data.editorHeight, data.plainText, data.presetId, data.result, data.sourceCount, data.sourceText, editorHeight, node.id, normalizedSourceText, normalizedStoredRichText, plainText, presetId, richText, shouldAdoptSourceText, sourceCount, updateNodeDataSilent]);

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
    handleNodeWidthChange: (nextWidth: number) => resizeNode(node.id, { width: clampTextFormatterNodeWidth(nextWidth) }),
    handlePresetChange: (value: string) => {
      const nextPresetId = normalizeFormattedTextPresetId(value);
      updateNodeData(node.id, nextPresetId === 'markdown'
        ? { presetId: nextPresetId, richText: '', sourceText: '' }
        : { presetId: nextPresetId });
    },
    hasIncomingText,
    plainText,
    preset,
    presetId,
    presetOptions: textFormatterPresetOptions,
    richText,
    shouldParseMarkdown,
    sourceCount,
    sourceText: normalizedSourceText,
    usesArticleEditor,
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

export function clampTextFormatterNodeWidth(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return TEXT_FORMATTER_NODE_DEFAULT_WIDTH;
  return Math.min(Math.max(Math.round(value), TEXT_FORMATTER_NODE_MIN_WIDTH), TEXT_FORMATTER_NODE_MAX_WIDTH);
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

function getSpeechHistory(data: TextToSpeechNodeData) {
  const items = uniqueStrings([...(data.resultAssetIds ?? []), data.resultAssetId]);
  if (items.length === 0) return { activeAssetId: undefined, activeIndex: -1, items };
  const activeIndex = clampIndex(data.activeResultIndex ?? items.length - 1, items.length);
  return { activeAssetId: items[activeIndex], activeIndex, items };
}

function appendSpeechResult(
  data: TextToSpeechNodeData,
  assetId: string,
  metadata: NonNullable<TextToSpeechNodeData['resultMetadata']>[string],
): Partial<TextToSpeechNodeData> {
  const items = uniqueStrings([...getSpeechHistory(data).items, assetId]);
  const activeIndex = items.length - 1;
  return {
    activeResultIndex: activeIndex,
    message: '',
    resultAssetId: assetId,
    resultAssetIds: items,
    resultMetadata: {
      ...(data.resultMetadata ?? {}),
      [assetId]: metadata,
    },
  };
}

function selectSpeechResult(data: TextToSpeechNodeData, index: number): Partial<TextToSpeechNodeData> {
  const items = getSpeechHistory(data).items;
  if (items.length === 0) return { activeResultIndex: -1, resultAssetId: undefined, resultAssetIds: [] };
  const activeIndex = clampIndex(index, items.length);
  return {
    activeResultIndex: activeIndex,
    resultAssetId: items[activeIndex],
    resultAssetIds: items,
  };
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

function clampSpeechSpeed(value: number) {
  return Math.min(2, Math.max(0.5, Math.round(value * 10) / 10));
}

function clampTopP(value: number) {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function modelSupportsParameter(parameters: string[] | undefined, parameter: string) {
  return Boolean(parameters?.includes(parameter));
}

function uniqueTexts(items: Array<string | undefined>) {
  return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}

function uniqueStrings(items: Array<string | undefined>) {
  return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return -1;
  return Math.min(Math.max(index, 0), length - 1);
}

function normalizeTextToSpeechLanguage(value: unknown): TextToSpeechLanguage {
  return value === 'ru' || value === 'en' || value === 'de' || value === 'es' || value === 'zh' ? value : 'auto';
}

function getTextToSpeechVoiceOptions(model: string, currentVoice?: string) {
  const options = getOpenRouterSpeechCapabilities(model).voices.map((voice) => ({ value: voice, label: voice }));
  if (!currentVoice || options.some((option) => option.value === currentVoice)) return options;
  return [{ value: currentVoice, label: currentVoice }, ...options];
}

function parseOptionalInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function detectSpeechLanguage(text: string): Exclude<TextToSpeechLanguage, 'auto'> {
  if (/[А-Яа-яЁё]/.test(text)) return 'ru';
  if (/[\u3400-\u9FFF]/.test(text)) return 'zh';
  if (/[ÄÖÜäöüß]/.test(text)) return 'de';
  if (/[ÁÉÍÓÚÑáéíóúñ¿¡]/.test(text)) return 'es';
  return 'en';
}

function arraysEqual(first: string[], second: string[]) {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}
