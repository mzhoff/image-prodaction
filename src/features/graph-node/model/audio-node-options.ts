// Display labels never replace the persisted provider model ID.
const transcriptionModelLabels: Record<string, string> = {
  'google/gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
};

export function transcriptionModelOptions(model: string) {
  const label = transcriptionModelLabels[model] ?? model.split('/').at(-1)!
    .split(/[-_]+/u).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  // Preserve existing custom models; do not silently switch the provider or
  // advertise other models without an audio-input capability check.
  return [{ value: model, label }];
}

export const transcriptionLanguageOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'ru', label: 'Russian' },
  { value: 'en', label: 'English' },
];
