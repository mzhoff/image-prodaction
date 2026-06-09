export type FormattedTextPresetId = 'universal' | 'telegram-post' | 'blog-article';

export type FormattedTextFeature =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'hashtag'
  | 'quote'
  | 'spoiler'
  | 'heading'
  | 'list'
  | 'table';

export interface FormattedTextPresetDefinition {
  id: FormattedTextPresetId;
  label: string;
  description: string;
  features: FormattedTextFeature[];
}

export const DEFAULT_FORMATTED_TEXT_PRESET_ID: FormattedTextPresetId = 'telegram-post';

export const FORMATTED_TEXT_PRESETS: FormattedTextPresetDefinition[] = [
  {
    id: 'telegram-post',
    label: 'Telegram Post',
    description: 'Rich message text for Telegram publication nodes.',
    features: ['bold', 'italic', 'underline', 'strikethrough', 'code', 'link', 'hashtag', 'quote', 'spoiler'],
  },
  {
    id: 'blog-article',
    label: 'Blog Article',
    description: 'Article text preset for blog/CMS publishing.',
    features: ['bold', 'italic', 'underline', 'strikethrough', 'code', 'link', 'hashtag', 'quote', 'heading', 'list', 'table'],
  },
  {
    id: 'universal',
    label: 'Universal',
    description: 'General rich-text formatter with broad editing affordances.',
    features: ['bold', 'italic', 'underline', 'strikethrough', 'code', 'link', 'hashtag', 'quote', 'spoiler', 'heading', 'list', 'table'],
  },
];

export function normalizeFormattedTextPresetId(value: unknown): FormattedTextPresetId {
  return FORMATTED_TEXT_PRESETS.some((preset) => preset.id === value)
    ? value as FormattedTextPresetId
    : DEFAULT_FORMATTED_TEXT_PRESET_ID;
}

export function getFormattedTextPresetDefinition(value: unknown): FormattedTextPresetDefinition {
  const presetId = normalizeFormattedTextPresetId(value);
  return FORMATTED_TEXT_PRESETS.find((preset) => preset.id === presetId) ?? FORMATTED_TEXT_PRESETS[0]!;
}
