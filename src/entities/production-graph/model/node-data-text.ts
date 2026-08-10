import type {
  TextToSpeechLanguage as SpeechLanguage,
  TextToSpeechResponseFormat as SpeechResponseFormat,
} from '@/shared/api/speech-contracts';
import type { FormattedTextPresetId } from './formatted-text';
import type { BaseNodeData } from './node-data-image';

export type TextPromptVariableDisplayMode = 'source-value' | 'value' | 'source';
export interface TextPromptVariable { id: string; alias: string }
export interface TextPromptNodeData extends BaseNodeData {
  disabledResultFilterIds?: string[]; result?: string; sourceCount?: number;
  text: string; textareaHeight?: number; variableDisplayMode?: TextPromptVariableDisplayMode;
  variables?: TextPromptVariable[];
}

export type TextConcatSeparator = 'newline' | 'double-newline' | 'space' | 'custom';
export interface TextConcatNodeData extends BaseNodeData {
  customSeparator: string; disabledResultFilterIds?: string[]; inputCount?: number;
  prefix: string; result?: string; separator: TextConcatSeparator; sourceCount?: number;
  suffix: string; optionalTextHeight?: number;
}

export type TextGenerationOutputStyle = 'plain' | 'markdown' | 'numbered-list';
export type TextGenerationReasoning = 'low' | 'medium' | 'high';
export interface TextGenerationNodeData extends BaseNodeData {
  activeResultIndex?: number; disabledResultFilterIds?: string[]; instruction: string;
  message?: string; model: string; outputStyle: TextGenerationOutputStyle;
  reasoning?: TextGenerationReasoning; result?: string; resultTexts?: string[]; temperature?: number;
}

export type TextToSpeechLanguage = SpeechLanguage;
export type TextToSpeechResponseFormat = SpeechResponseFormat;
export interface TextToSpeechResultMetadata {
  createdAt: string; generationId?: string; language: TextToSpeechLanguage;
  mimeType: string; model: string; sizeBytes: number; voice: string;
}
export interface TextToSpeechNodeData extends BaseNodeData {
  activeResultIndex?: number; language: TextToSpeechLanguage; localText?: string;
  message?: string; model: string; responseFormat: TextToSpeechResponseFormat;
  resultAssetId?: string; resultAssetIds?: string[];
  resultMetadata?: Record<string, TextToSpeechResultMetadata>; seed?: number;
  sourceText?: string; speed?: number; temperature?: number; topP?: number; voice: string;
}

export interface RouterNodeData extends BaseNodeData { inputLabel?: string; outputLabel?: string }
export interface TextFormatterNodeData extends BaseNodeData {
  editorHeight?: number; message?: string; plainText: string; presetId: FormattedTextPresetId;
  result?: string; richText: string; sourceCount?: number; sourceText?: string;
}
export type TextSplitterMode = 'newline' | 'paragraph' | 'numbered-list' | 'delimiter';
export interface TextSplitterNodeData extends BaseNodeData {
  activeItemIndex?: number; delimiter: string; items?: string[]; message?: string;
  mode: TextSplitterMode; result?: string; sourceText?: string;
}
export type IteratorActiveKind = 'image' | 'text';
export interface IteratorNodeData extends BaseNodeData {
  activeImageAssetId?: string; activeIndex: number; activeKind: IteratorActiveKind;
  activeText?: string; disabledResultFilterIds?: string[]; imageCount?: number;
  message?: string; textCount?: number;
}
