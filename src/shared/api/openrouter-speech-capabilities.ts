import type { TextToSpeechLanguage, TextToSpeechResponseFormat } from '@/entities/production-graph/model/types';

export interface OpenRouterSpeechCapabilities {
  formats: TextToSpeechResponseFormat[];
  supportsSeed?: boolean;
  supportsSpeed?: boolean;
  supportsResponseFormat?: boolean;
  supportsTemperature?: boolean;
  supportsTopP?: boolean;
  voices: string[];
}

const defaultSpeechCapabilities: OpenRouterSpeechCapabilities = {
  formats: ['mp3', 'pcm'],
  supportsSeed: true,
  supportsResponseFormat: true,
  supportsTemperature: true,
  supportsTopP: true,
  voices: ['default'],
};

const speechCapabilitiesByModel: Record<string, OpenRouterSpeechCapabilities> = {
  'microsoft/mai-voice-2': {
    formats: ['mp3', 'pcm'],
    supportsResponseFormat: true,
    supportsSeed: true,
    supportsSpeed: true,
    supportsTemperature: true,
    supportsTopP: true,
    voices: [
      'en-US-Harper:MAI-Voice-2',
      'en-US-Ethan:MAI-Voice-2',
      'en-US-Olivia:MAI-Voice-2',
      'ru-RU-Masha:MAI-Voice-2',
      'ru-RU-Lev:MAI-Voice-2',
      'de-DE-Mia:MAI-Voice-2',
      'de-DE-Klaus:MAI-Voice-2',
      'es-ES-Marta:MAI-Voice-2',
      'es-MX-Valeria:MAI-Voice-2',
      'zh-CN-Mei:MAI-Voice-2',
      'zh-CN-Bo:MAI-Voice-2',
    ],
  },
  'x-ai/grok-voice-tts-1.0': {
    formats: ['mp3', 'pcm'],
    supportsResponseFormat: true,
    supportsSeed: true,
    supportsTemperature: true,
    supportsTopP: true,
    voices: ['Eve', 'Ara', 'Rex', 'Sal', 'Leo'],
  },
  'google/gemini-3.1-flash-tts-preview': {
    formats: ['pcm'],
    supportsResponseFormat: true,
    supportsSeed: true,
    supportsTemperature: true,
    supportsTopP: true,
    voices: ['Kore', 'Puck', 'Zephyr', 'Charon', 'Fenrir'],
  },
  'zyphra/zonos-v0.1-transformer': {
    formats: ['mp3', 'pcm'],
    supportsResponseFormat: true,
    supportsSeed: true,
    supportsTemperature: true,
    supportsTopP: true,
    voices: ['default'],
  },
  'zyphra/zonos-v0.1-hybrid': {
    formats: ['mp3', 'pcm'],
    supportsResponseFormat: true,
    supportsSeed: true,
    supportsTemperature: true,
    supportsTopP: true,
    voices: ['default'],
  },
  'sesame/csm-1b': {
    formats: ['mp3', 'pcm'],
    supportsResponseFormat: true,
    supportsSeed: true,
    supportsTemperature: true,
    supportsTopP: true,
    voices: ['default'],
  },
  'canopylabs/orpheus-3b-0.1-ft': {
    formats: ['mp3', 'pcm'],
    supportsResponseFormat: true,
    supportsSeed: true,
    supportsTemperature: true,
    supportsTopP: true,
    voices: ['tara', 'leah', 'jess', 'leo', 'dan'],
  },
  'hexgrad/kokoro-82m': {
    formats: ['mp3', 'pcm'],
    supportsResponseFormat: true,
    supportsSeed: true,
    supportsTemperature: true,
    supportsTopP: true,
    voices: ['af_heart', 'af_alloy', 'am_adam', 'bf_emma', 'bm_george'],
  },
  'mistralai/voxtral-mini-tts-2603': {
    formats: ['mp3', 'pcm'],
    supportsResponseFormat: true,
    supportsSeed: true,
    supportsTemperature: true,
    supportsTopP: true,
    voices: ['default'],
  },
};

const languageVoicePrefixes: Partial<Record<TextToSpeechLanguage, string[]>> = {
  de: ['de-DE-'],
  en: ['en-US-', 'en-AU-'],
  es: ['es-ES-', 'es-MX-'],
  ru: ['ru-RU-'],
  zh: ['zh-CN-'],
};

export function getOpenRouterSpeechCapabilities(model: string): OpenRouterSpeechCapabilities {
  return speechCapabilitiesByModel[model] ?? defaultSpeechCapabilities;
}

export function getSafeSpeechResponseFormat(model: string, format?: TextToSpeechResponseFormat) {
  const capabilities = getOpenRouterSpeechCapabilities(model);
  return capabilities.formats.includes(format ?? 'mp3') ? format ?? capabilities.formats[0] : capabilities.formats[0];
}

export function getOpenRouterSpeechResponseFormat(model: string, format?: TextToSpeechResponseFormat) {
  const capabilities = getOpenRouterSpeechCapabilities(model);
  if (!capabilities.supportsResponseFormat) return undefined;
  return getSafeSpeechResponseFormat(model, format);
}

export function getSafeSpeechVoice(model: string, voice?: string, language?: TextToSpeechLanguage) {
  const capabilities = getOpenRouterSpeechCapabilities(model);
  if (voice && capabilities.voices.includes(voice)) return voice;
  const prefixes = language ? languageVoicePrefixes[language] : undefined;
  const languageVoice = prefixes
    ? capabilities.voices.find((item) => prefixes.some((prefix) => item.startsWith(prefix)))
    : undefined;
  return languageVoice ?? capabilities.voices[0] ?? 'default';
}
