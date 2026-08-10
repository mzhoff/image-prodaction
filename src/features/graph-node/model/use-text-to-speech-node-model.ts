'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { saveAssetBlob } from '@/entities/production-graph/lib/asset-db';
import { getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import type { ProductionNode, TextToSpeechNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { DEFAULT_SPEECH_MODEL } from '@/shared/api/openrouter-models';
import {
  getOpenRouterSpeechCapabilities,
  getSafeSpeechResponseFormat,
  getSafeSpeechVoice,
} from '@/shared/api/openrouter-speech-capabilities';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { requestGenerateSpeech } from '../api/ai-client';
import { getSelectedModelId, modelSelectOptions } from '../lib/node-select-options';
import { textToSpeechLanguageOptions, textToSpeechResponseFormatLabels } from './text-workflow-options';
import {
  appendSpeechResult,
  clampSpeechSpeed,
  clampTemperature,
  clampTopP,
  detectSpeechLanguage,
  getSpeechHistory,
  getTextToSpeechVoiceOptions,
  normalizeTextToSpeechLanguage,
  parseOptionalInteger,
  selectSpeechResult,
} from './text-workflow-values';

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
  const responseFormatOptions = capabilities.formats.map((format) => ({
    value: format,
    label: textToSpeechResponseFormatLabels[format],
  }));
  const speed = clampSpeechSpeed(data.speed ?? 1);
  const temperature = clampTemperature(data.temperature ?? 1);
  const topP = clampTopP(data.topP ?? 1);
  const seed = typeof data.seed === 'number' && Number.isInteger(data.seed) ? data.seed : undefined;
  const inputText = useMemo(() => getIncomingTextInputs(node.id, 'text', { edges, nodes })
    .map((input) => input.text).join('\n\n'), [edges, node.id, nodes]);
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
    if (Object.keys(nextData).length > 0) updateNodeDataSilent(node.id, nextData);
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
    handleLanguageChange: (value: string) => updateNodeData(node.id, { language: normalizeTextToSpeechLanguage(value) }),
    handleLocalTextChange: (localText: string) => updateNodeData(node.id, { localText }),
    handleModelChange: (model: string) => updateNodeData(node.id, {
      model,
      responseFormat: getSafeSpeechResponseFormat(model, data.responseFormat),
      voice: getSafeSpeechVoice(model, data.voice, language),
    }),
    handleResponseFormatChange: (value: string) => updateNodeData(node.id, {
      responseFormat: getSafeSpeechResponseFormat(selectedModel, value === 'pcm' ? 'pcm' : 'mp3'),
    }),
    handleResultHistoryChange: (index: number) => updateNodeDataSilent(node.id, selectSpeechResult(data, index)),
    handleSeedChange: (value: string) => updateNodeData(node.id, { seed: parseOptionalInteger(value) }),
    handleSpeedChange: (value: number) => updateNodeData(node.id, { speed: clampSpeechSpeed(value) }),
    handleTemperatureChange: (value: number) => updateNodeData(node.id, { temperature: clampTemperature(value) }),
    handleTopPChange: (value: number) => updateNodeData(node.id, { topP: clampTopP(value) }),
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
