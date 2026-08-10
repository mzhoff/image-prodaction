import { FORMATTED_TEXT_PRESETS } from '@/entities/production-graph/model/formatted-text';
import type { TextToSpeechResponseFormat } from '@/entities/production-graph/model/types';
import type { DarkSelectOption } from '@/shared/ui/dark-select';

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

export const textToSpeechResponseFormatLabels: Record<TextToSpeechResponseFormat, string> = {
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
