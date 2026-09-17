/** Curated image-to-text models verified against the OpenRouter catalogue 2026-09-06.
 * No price promises: actual usage remains in the provider ledger. */
export const TIMELINE_MODEL_OPTIONS = [
  { value: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'qwen/qwen3-vl-8b-instruct', label: 'Qwen3 VL 8B' },
  { value: 'qwen/qwen3-vl-30b-a3b-instruct', label: 'Qwen3 VL 30B' },
  { value: 'mistralai/mistral-small-3.2-24b-instruct', label: 'Mistral Small 3.2' },
] as const;
export const DEFAULT_TIMELINE_MODEL = TIMELINE_MODEL_OPTIONS[0].value;
export function isTimelineModel(value: string): boolean { return TIMELINE_MODEL_OPTIONS.some((option) => option.value === value); }
