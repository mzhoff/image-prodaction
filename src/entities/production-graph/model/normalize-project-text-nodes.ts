import { normalizeNodeSize } from './node-layout';
import { normalizeFormattedTextPresetId } from './formatted-text';
import { normalizeStringArray } from './normalize-project-values';
import {
  normalizeTextPromptTextareaHeight,
  normalizeTextPromptVariableDisplayMode,
  normalizeTextPromptVariables,
} from './text-prompt-normalization';
import type { ProductionNode, ProductionNodeData } from './types';

export function normalizeTextNode(node: ProductionNode): ProductionNode | null {
  if (node.type === 'textPrompt') {
    const data = node.data as ProductionNodeData & {
      disabledResultFilterIds?: unknown;
      textareaHeight?: unknown;
      variableDisplayMode?: unknown;
      variables?: unknown;
    };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        result: '',
        sourceCount: 0,
        text: '',
        ...data,
        disabledResultFilterIds: normalizeStringArray(data.disabledResultFilterIds),
        textareaHeight: normalizeTextPromptTextareaHeight(data.textareaHeight),
        title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Prompt',
        variableDisplayMode: normalizeTextPromptVariableDisplayMode(data.variableDisplayMode),
        variables: normalizeTextPromptVariables(data.variables),
      },
    } as ProductionNode;
  }

  if (node.type === 'textConcat') {
    const data = node.data as unknown as Record<string, unknown>;
    const optionalTextHeight = normalizeTextConcatOptionalHeight(data?.optionalTextHeight);
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        separator: 'double-newline',
        customSeparator: '',
        inputCount: 2,
        prefix: '',
        suffix: '',
        result: '',
        sourceCount: 0,
        ...node.data,
        disabledResultFilterIds: normalizeStringArray(data.disabledResultFilterIds),
        title: 'Concat',
        optionalTextHeight,
      },
    } as ProductionNode;
  }

  if (node.type === 'textGeneration') {
    const data = node.data as ProductionNodeData & { disabledResultFilterIds?: unknown };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        model: 'google/gemini-2.5-flash',
        instruction: 'Rewrite the connected text into a concise production-ready image prompt.',
        outputStyle: 'plain',
        reasoning: 'low',
        temperature: 1,
        activeResultIndex: -1,
        result: '',
        resultTexts: [],
        ...data,
        disabledResultFilterIds: normalizeStringArray(data.disabledResultFilterIds),
        title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Text Gen',
      },
    } as ProductionNode;
  }

  if (node.type === 'textToSpeech') {
    const data = node.data as ProductionNodeData & {
      language?: unknown;
      responseFormat?: unknown;
      resultAssetIds?: unknown;
      resultMetadata?: unknown;
    };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        activeResultIndex: -1,
        localText: '',
        message: '',
        model: 'x-ai/grok-voice-tts-1.0',
        sourceText: '',
        speed: 1,
        voice: 'Eve',
        ...data,
        language: normalizeTextToSpeechLanguage(data.language),
        responseFormat: data.responseFormat === 'pcm' ? 'pcm' : 'mp3',
        resultAssetIds: normalizeStringArray(data.resultAssetIds),
        resultMetadata: isRecord(data.resultMetadata) ? data.resultMetadata : {},
        title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Voice',
      },
    } as ProductionNode;
  }

  if (node.type === 'textFormatter') {
    const data = node.data as ProductionNodeData & { editorHeight?: unknown; presetId?: unknown };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        message: '',
        plainText: '',
        result: '',
        richText: '',
        sourceCount: 0,
        sourceText: '',
        ...data,
        editorHeight: normalizeTextFormatterEditorHeight(data.editorHeight),
        presetId: normalizeFormattedTextPresetId(data.presetId),
        title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Formatter',
      },
    } as ProductionNode;
  }

  if (node.type === 'textSplitter') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        mode: 'delimiter',
        delimiter: '*',
        activeItemIndex: 0,
        items: [],
        message: '',
        result: '',
        sourceText: '',
        ...node.data,
        title: 'Splitter',
      },
    } as ProductionNode;
  }

  return null;
}

function normalizeTextToSpeechLanguage(value: unknown) {
  return value === 'ru' || value === 'en' || value === 'de' || value === 'es' || value === 'zh' ? value : 'auto';
}

function normalizeTextConcatOptionalHeight(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 95;
  return Math.min(Math.max(Math.round(value), 72), 420);
}

function normalizeTextFormatterEditorHeight(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 360;
  return Math.min(Math.max(Math.round(value), 180), 760);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
