import { getNodeDefinition } from '@/entities/production-graph/model/node-registry';
import type {
  ProductionNode,
  TextConcatNodeData,
  TextConcatSeparator,
  TextGenerationNodeData,
  TextPromptNodeData,
  TextToSpeechLanguage,
  TextToSpeechNodeData,
} from '@/entities/production-graph/model/types';
import { getOpenRouterSpeechCapabilities } from '@/shared/api/openrouter-speech-capabilities';
import {
  TEXT_CONCAT_OPTIONAL_TEXTAREA_DEFAULT_HEIGHT,
  TEXT_CONCAT_OPTIONAL_TEXTAREA_MAX_HEIGHT,
  TEXT_CONCAT_OPTIONAL_TEXTAREA_MIN_HEIGHT,
  TEXT_FORMATTER_EDITOR_DEFAULT_HEIGHT,
  TEXT_FORMATTER_EDITOR_MAX_HEIGHT,
  TEXT_FORMATTER_EDITOR_MIN_HEIGHT,
  TEXT_FORMATTER_NODE_DEFAULT_WIDTH,
  TEXT_FORMATTER_NODE_MAX_WIDTH,
  TEXT_FORMATTER_NODE_MIN_WIDTH,
  TEXT_PROMPT_TEXTAREA_DEFAULT_HEIGHT,
  TEXT_PROMPT_TEXTAREA_MAX_HEIGHT,
  TEXT_PROMPT_TEXTAREA_MIN_HEIGHT,
} from './text-workflow-options';

export function composeConcatText(data: TextConcatNodeData, parts: string[]) {
  const separator = getSeparator(data.separator, data.customSeparator);
  return [
    parts.map((part) => part.trim()).filter(Boolean).join(separator),
    data.suffix.trim(),
  ].filter(Boolean).join(separator);
}

export function samePromptVariables(
  first: TextPromptNodeData['variables'],
  second: NonNullable<TextPromptNodeData['variables']>,
) {
  if (!Array.isArray(first) || first.length !== second.length) return false;
  return first.every((variable, index) => variable.id === second[index]?.id
    && variable.alias === second[index]?.alias);
}

export function getCustomTextPromptSourceAlias(sourceNode: ProductionNode | undefined) {
  const title = sourceNode?.data.title?.trim();
  if (!sourceNode || !title) return undefined;
  return title === getNodeDefinition(sourceNode.type).title ? undefined : title;
}

export function clampTextPromptTextareaHeight(value: unknown) {
  return clampDimension(value, TEXT_PROMPT_TEXTAREA_DEFAULT_HEIGHT,
    TEXT_PROMPT_TEXTAREA_MIN_HEIGHT, TEXT_PROMPT_TEXTAREA_MAX_HEIGHT);
}

export function clampTextConcatOptionalHeight(value: unknown) {
  return clampDimension(value, TEXT_CONCAT_OPTIONAL_TEXTAREA_DEFAULT_HEIGHT,
    TEXT_CONCAT_OPTIONAL_TEXTAREA_MIN_HEIGHT, TEXT_CONCAT_OPTIONAL_TEXTAREA_MAX_HEIGHT);
}

export function clampTextFormatterEditorHeight(value: unknown) {
  return clampDimension(value, TEXT_FORMATTER_EDITOR_DEFAULT_HEIGHT,
    TEXT_FORMATTER_EDITOR_MIN_HEIGHT, TEXT_FORMATTER_EDITOR_MAX_HEIGHT);
}

export function clampTextFormatterNodeWidth(value: unknown) {
  return clampDimension(value, TEXT_FORMATTER_NODE_DEFAULT_WIDTH,
    TEXT_FORMATTER_NODE_MIN_WIDTH, TEXT_FORMATTER_NODE_MAX_WIDTH);
}

export function getTextHistory(data: TextGenerationNodeData) {
  const items = uniqueTexts([...(data.resultTexts ?? []), data.result]);
  if (items.length === 0) return { activeIndex: -1, activeText: '', items };
  const activeIndex = clampIndex(data.activeResultIndex ?? items.length - 1, items.length);
  return { activeIndex, activeText: items[activeIndex] ?? '', items };
}

export function getSpeechHistory(data: TextToSpeechNodeData) {
  const items = uniqueStrings([...(data.resultAssetIds ?? []), data.resultAssetId]);
  if (items.length === 0) return { activeAssetId: undefined, activeIndex: -1, items };
  const activeIndex = clampIndex(data.activeResultIndex ?? items.length - 1, items.length);
  return { activeAssetId: items[activeIndex], activeIndex, items };
}

export function appendSpeechResult(
  data: TextToSpeechNodeData,
  assetId: string,
  metadata: NonNullable<TextToSpeechNodeData['resultMetadata']>[string],
): Partial<TextToSpeechNodeData> {
  const items = uniqueStrings([...getSpeechHistory(data).items, assetId]);
  return {
    activeResultIndex: items.length - 1,
    message: '',
    resultAssetId: assetId,
    resultAssetIds: items,
    resultMetadata: { ...(data.resultMetadata ?? {}), [assetId]: metadata },
  };
}

export function selectSpeechResult(data: TextToSpeechNodeData, index: number): Partial<TextToSpeechNodeData> {
  const items = getSpeechHistory(data).items;
  if (items.length === 0) return { activeResultIndex: -1, resultAssetId: undefined, resultAssetIds: [] };
  const activeIndex = clampIndex(index, items.length);
  return { activeResultIndex: activeIndex, resultAssetId: items[activeIndex], resultAssetIds: items };
}

export function appendTextResult(data: TextGenerationNodeData, text: string): Partial<TextGenerationNodeData> {
  const items = uniqueTexts([...getTextHistory(data).items, text]);
  return { activeResultIndex: items.length - 1, result: items.at(-1), resultTexts: items };
}

export function selectTextResult(data: TextGenerationNodeData, index: number): Partial<TextGenerationNodeData> {
  const items = getTextHistory(data).items;
  if (items.length === 0) return { activeResultIndex: -1, result: '', resultTexts: [] };
  const activeIndex = clampIndex(index, items.length);
  return { activeResultIndex: activeIndex, result: items[activeIndex], resultTexts: items };
}

export function updateTextResult(data: TextGenerationNodeData, text: string): Partial<TextGenerationNodeData> {
  const history = getTextHistory(data);
  const activeIndex = history.activeIndex >= 0 ? history.activeIndex : 0;
  const items = history.items.length > 0 ? [...history.items] : [''];
  items[activeIndex] = text;
  return { activeResultIndex: activeIndex, result: text, resultTexts: items };
}

export function clampTemperature(value: number) {
  return Math.min(2, Math.max(0, Math.round(value * 10) / 10));
}

export function clampSpeechSpeed(value: number) {
  return Math.min(2, Math.max(0.5, Math.round(value * 10) / 10));
}

export function clampTopP(value: number) {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

export function modelSupportsParameter(parameters: string[] | undefined, parameter: string) {
  return Boolean(parameters?.includes(parameter));
}

export function clampIndex(index: number, length: number) {
  if (length <= 0) return -1;
  return Math.min(Math.max(index, 0), length - 1);
}

export function normalizeTextToSpeechLanguage(value: unknown): TextToSpeechLanguage {
  return value === 'ru' || value === 'en' || value === 'de' || value === 'es' || value === 'zh' ? value : 'auto';
}

export function getTextToSpeechVoiceOptions(model: string, currentVoice?: string) {
  const options = getOpenRouterSpeechCapabilities(model).voices.map((voice) => ({ value: voice, label: voice }));
  if (!currentVoice || options.some((option) => option.value === currentVoice)) return options;
  return [{ value: currentVoice, label: currentVoice }, ...options];
}

export function parseOptionalInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function detectSpeechLanguage(text: string): Exclude<TextToSpeechLanguage, 'auto'> {
  if (/[А-Яа-яЁё]/.test(text)) return 'ru';
  if (/[㐀-鿿]/.test(text)) return 'zh';
  if (/[ÄÖÜäöüß]/.test(text)) return 'de';
  if (/[ÁÉÍÓÚÑáéíóúñ¿¡]/.test(text)) return 'es';
  return 'en';
}

export function arraysEqual(first: string[], second: string[]) {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}

function getSeparator(separator: TextConcatSeparator, customSeparator: string) {
  if (separator === 'newline') return '\n';
  if (separator === 'space') return ' ';
  if (separator === 'custom') return customSeparator || '\n\n';
  return '\n\n';
}

function uniqueTexts(items: Array<string | undefined>) {
  return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}

function uniqueStrings(items: Array<string | undefined>) {
  return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}

function clampDimension(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}
