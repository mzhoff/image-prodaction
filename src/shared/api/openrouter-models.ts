export interface OpenRouterRawModel {
  id: string;
  name: string;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
    audio?: string;
  };
  supported_parameters?: string[];
}

export interface OpenRouterModelOption {
  id: string;
  name: string;
  label: string;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  aspectRatios?: string[];
  sizes?: string[];
}

export interface OpenRouterSpeechModelOption extends OpenRouterModelOption {
  contextLength?: number;
  pricing?: {
    completion?: string;
    prompt?: string;
  };
}

export interface OpenRouterModelCatalog {
  analysisModels: OpenRouterModelOption[];
  imageModels: OpenRouterModelOption[];
  speechModels: OpenRouterSpeechModelOption[];
  source: 'openrouter' | 'fallback';
  updatedAt: string;
}

export const DEFAULT_ANALYSIS_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image';
export const DEFAULT_SPEECH_MODEL = 'x-ai/grok-voice-tts-1.0';

export const MODEL_FALLBACK_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const MODEL_EXTENDED_GEMINI_FLASH_ASPECT_RATIOS = [
  ...MODEL_FALLBACK_ASPECT_RATIOS,
  '1:4',
  '4:1',
  '1:8',
  '8:1',
];
export const MODEL_FALLBACK_SIZES = ['1K', '2K', '4K'];
export const MODEL_EXTENDED_GEMINI_FLASH_SIZES = ['0.5K', ...MODEL_FALLBACK_SIZES];

const imageModelConfig: Record<string, { label: string; aspectRatios: string[]; sizes: string[] }> = {
  'openrouter/auto': {
    label: 'Auto Router',
    aspectRatios: MODEL_FALLBACK_ASPECT_RATIOS,
    sizes: MODEL_FALLBACK_SIZES,
  },
  'openai/gpt-5.4-image-2': {
    label: 'GPT Image 2',
    aspectRatios: MODEL_FALLBACK_ASPECT_RATIOS,
    sizes: ['1K', '2K', '4K'],
  },
  'openai/gpt-5-image': {
    label: 'GPT Image',
    aspectRatios: MODEL_FALLBACK_ASPECT_RATIOS,
    sizes: ['1K', '2K', '4K'],
  },
  'openai/gpt-5-image-mini': {
    label: 'GPT Image Mini',
    aspectRatios: MODEL_FALLBACK_ASPECT_RATIOS,
    sizes: ['1K', '2K'],
  },
  'google/gemini-3.1-flash-image-preview': {
    label: 'Nano Banana 2',
    aspectRatios: MODEL_EXTENDED_GEMINI_FLASH_ASPECT_RATIOS,
    sizes: MODEL_EXTENDED_GEMINI_FLASH_SIZES,
  },
  'google/gemini-3-pro-image-preview': {
    label: 'Nano Banana Pro',
    aspectRatios: MODEL_FALLBACK_ASPECT_RATIOS,
    sizes: ['1K', '2K', '4K'],
  },
  'google/gemini-2.5-flash-image': {
    label: 'Nano Banana',
    aspectRatios: MODEL_FALLBACK_ASPECT_RATIOS,
    sizes: ['1K', '2K'],
  },
};

const analysisModelLabels: Record<string, string> = {
  'google/gemini-3.5-flash': 'Gemini 3.5 Flash',
  'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'openai/gpt-5.5-pro': 'GPT 5.5 Pro',
  'openai/gpt-5.5': 'GPT 5.5',
  'openai/gpt-5-mini': 'GPT 5 Mini',
  'openai/gpt-5-pro': 'GPT 5 Pro',
  'anthropic/claude-sonnet-4.6': 'Claude Sonnet 4.6',
  'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'anthropic/claude-sonnet-4': 'Claude Sonnet 4',
};

const speechModelLabels: Record<string, string> = {
  'microsoft/mai-voice-2': 'MAI-Voice-2',
  'x-ai/grok-voice-tts-1.0': 'Grok Voice TTS',
  'google/gemini-3.1-flash-tts-preview': 'Gemini 3.1 Flash TTS',
  'zyphra/zonos-v0.1-transformer': 'Zonos Transformer',
  'zyphra/zonos-v0.1-hybrid': 'Zonos Hybrid',
  'sesame/csm-1b': 'Sesame CSM 1B',
  'canopylabs/orpheus-3b-0.1-ft': 'Orpheus 3B',
  'hexgrad/kokoro-82m': 'Kokoro 82M',
  'mistralai/voxtral-mini-tts-2603': 'Voxtral Mini TTS',
};

const analysisModelSupportedParameters: Record<string, string[]> = {
  'google/gemini-3.5-flash': ['include_reasoning', 'max_tokens', 'reasoning', 'response_format', 'seed', 'stop', 'structured_outputs', 'temperature', 'tool_choice', 'tools', 'top_p'],
  'google/gemini-2.5-flash': ['include_reasoning', 'max_tokens', 'reasoning', 'response_format', 'seed', 'stop', 'structured_outputs', 'temperature', 'tool_choice', 'tools', 'top_p'],
  'google/gemini-2.5-pro': ['include_reasoning', 'max_tokens', 'reasoning', 'response_format', 'seed', 'stop', 'structured_outputs', 'temperature', 'tool_choice', 'tools', 'top_p'],
  'openai/gpt-5.5-pro': ['max_tokens', 'reasoning', 'response_format', 'seed', 'structured_outputs', 'tool_choice', 'tools'],
  'openai/gpt-5.5': ['max_tokens', 'reasoning', 'response_format', 'seed', 'structured_outputs', 'tool_choice', 'tools'],
  'openai/gpt-5-mini': ['max_tokens', 'reasoning', 'response_format', 'seed', 'structured_outputs', 'tool_choice', 'tools'],
  'openai/gpt-5-pro': ['max_tokens', 'reasoning', 'response_format', 'seed', 'structured_outputs', 'tool_choice', 'tools'],
  'anthropic/claude-sonnet-4.6': ['max_tokens', 'reasoning', 'stop', 'temperature', 'tool_choice', 'tools', 'top_k', 'top_p', 'verbosity'],
  'anthropic/claude-sonnet-4.5': ['max_tokens', 'reasoning', 'stop', 'temperature', 'tool_choice', 'tools', 'top_k', 'top_p'],
  'anthropic/claude-sonnet-4': ['max_tokens', 'reasoning', 'stop', 'temperature', 'tool_choice', 'tools', 'top_k', 'top_p'],
};

export const PREFERRED_ANALYSIS_MODEL_IDS = [
  'google/gemini-3.5-flash',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'openai/gpt-5.5',
  'openai/gpt-5.5-pro',
  'openai/gpt-5-mini',
  'openai/gpt-5-pro',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-sonnet-4',
];

export const PREFERRED_IMAGE_MODEL_IDS = [
  'openrouter/auto',
  'google/gemini-2.5-flash-image',
  'google/gemini-3.1-flash-image-preview',
  'google/gemini-3-pro-image-preview',
  'openai/gpt-5-image-mini',
  'openai/gpt-5-image',
  'openai/gpt-5.4-image-2',
];

export const PREFERRED_SPEECH_MODEL_IDS = [
  'x-ai/grok-voice-tts-1.0',
  'google/gemini-3.1-flash-tts-preview',
  'hexgrad/kokoro-82m',
  'microsoft/mai-voice-2',
  'sesame/csm-1b',
  'canopylabs/orpheus-3b-0.1-ft',
];

const UNSTABLE_SPEECH_MODEL_IDS = new Set([
  'mistralai/voxtral-mini-tts-2603',
  'zyphra/zonos-v0.1-transformer',
  'zyphra/zonos-v0.1-hybrid',
]);

export function createFallbackCatalog(): OpenRouterModelCatalog {
  return {
    analysisModels: PREFERRED_ANALYSIS_MODEL_IDS.map((id) => createFallbackModel(id, 'analysis')),
    imageModels: PREFERRED_IMAGE_MODEL_IDS.map((id) => createFallbackModel(id, 'image')),
    speechModels: PREFERRED_SPEECH_MODEL_IDS.map(createFallbackSpeechModel),
    source: 'fallback',
    updatedAt: new Date().toISOString(),
  };
}

export function createCatalogFromOpenRouter(models: OpenRouterRawModel[], speechModels: OpenRouterRawModel[] = []): OpenRouterModelCatalog {
  const byId = new Map(models.map((model) => [model.id, model]));
  const speechById = new Map(speechModels.map((model) => [model.id, model]));
  const analysisModels = PREFERRED_ANALYSIS_MODEL_IDS
    .map((id) => byId.get(id))
    .filter((model): model is OpenRouterRawModel => Boolean(model))
    .filter((model) => hasModalities(model, ['image', 'text'], ['text']))
    .map((model) => toModelOption(model, 'analysis'));

  const imageModels = PREFERRED_IMAGE_MODEL_IDS
    .map((id) => byId.get(id))
    .filter((model): model is OpenRouterRawModel => Boolean(model))
    .filter((model) => hasModalities(model, ['text'], ['image']))
    .map((model) => toModelOption(model, 'image'));

  const discoveredSpeechModels = speechModels.length
    ? speechModels
    : models.filter((model) => hasSpeechOutput(model));
  const orderedSpeechModels = [
    ...PREFERRED_SPEECH_MODEL_IDS
      .map((id) => speechById.get(id) ?? byId.get(id))
      .filter((model): model is OpenRouterRawModel => Boolean(model)),
    ...discoveredSpeechModels.filter((model) => !PREFERRED_SPEECH_MODEL_IDS.includes(model.id)),
  ];
  const speechModelsCatalog = uniqueModelsById(orderedSpeechModels)
    .filter(hasSpeechOutput)
    .filter((model) => !UNSTABLE_SPEECH_MODEL_IDS.has(model.id))
    .map(toSpeechModelOption);

  return {
    analysisModels,
    imageModels,
    speechModels: speechModelsCatalog,
    source: 'openrouter',
    updatedAt: new Date().toISOString(),
  };
}

export function getImageModelConfig(modelId: string) {
  return imageModelConfig[modelId] ?? {
    label: modelId,
    aspectRatios: MODEL_FALLBACK_ASPECT_RATIOS,
    sizes: MODEL_FALLBACK_SIZES,
  };
}

function hasModalities(model: OpenRouterRawModel, input: string[], output: string[]) {
  const inputModalities = model.architecture?.input_modalities ?? [];
  const outputModalities = model.architecture?.output_modalities ?? [];
  return input.every((item) => inputModalities.includes(item)) && output.every((item) => outputModalities.includes(item));
}

function hasSpeechOutput(model: OpenRouterRawModel) {
  const outputModalities = model.architecture?.output_modalities ?? [];
  return outputModalities.includes('speech');
}

function toModelOption(model: OpenRouterRawModel, type: 'analysis' | 'image'): OpenRouterModelOption {
  const imageConfig = type === 'image' ? getImageModelConfig(model.id) : undefined;
  const label = imageConfig?.label ?? analysisModelLabels[model.id] ?? model.name;

  return {
    id: model.id,
    name: model.name,
    label,
    inputModalities: model.architecture?.input_modalities ?? [],
    outputModalities: model.architecture?.output_modalities ?? [],
    supportedParameters: model.supported_parameters ?? [],
    aspectRatios: imageConfig?.aspectRatios,
    sizes: imageConfig?.sizes,
  };
}

function toSpeechModelOption(model: OpenRouterRawModel): OpenRouterSpeechModelOption {
  return {
    id: model.id,
    name: model.name,
    label: speechModelLabels[model.id] ?? model.name,
    inputModalities: model.architecture?.input_modalities ?? ['text'],
    outputModalities: model.architecture?.output_modalities ?? ['speech'],
    supportedParameters: model.supported_parameters ?? ['response_format'],
    contextLength: model.context_length,
    pricing: model.pricing,
  };
}

function createFallbackModel(id: string, type: 'analysis' | 'image'): OpenRouterModelOption {
  const imageConfig = type === 'image' ? getImageModelConfig(id) : undefined;
  return {
    id,
    name: imageConfig?.label ?? analysisModelLabels[id] ?? id,
    label: imageConfig?.label ?? analysisModelLabels[id] ?? id,
    inputModalities: type === 'image' ? ['text', 'image'] : ['text', 'image'],
    outputModalities: type === 'image' ? ['image', 'text'] : ['text'],
    supportedParameters: type === 'analysis'
      ? analysisModelSupportedParameters[id] ?? ['max_tokens', 'temperature', 'top_p']
      : ['max_tokens', 'temperature', 'top_p'],
    aspectRatios: imageConfig?.aspectRatios,
    sizes: imageConfig?.sizes,
  };
}

function createFallbackSpeechModel(id: string): OpenRouterSpeechModelOption {
  return {
    id,
    name: speechModelLabels[id] ?? id,
    label: speechModelLabels[id] ?? id,
    inputModalities: ['text'],
    outputModalities: ['speech'],
    supportedParameters: ['response_format', 'seed', 'temperature', 'top_p'],
    contextLength: id === 'x-ai/grok-voice-tts-1.0' ? 15_000 : 4096,
  };
}

function uniqueModelsById(models: OpenRouterRawModel[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}
