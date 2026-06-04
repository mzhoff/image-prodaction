export interface OpenRouterRawModel {
  id: string;
  name: string;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
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

export interface OpenRouterModelCatalog {
  analysisModels: OpenRouterModelOption[];
  imageModels: OpenRouterModelOption[];
  source: 'openrouter' | 'fallback';
  updatedAt: string;
}

export const DEFAULT_ANALYSIS_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-image';

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
  'google/gemini-2.5-flash-image',
  'google/gemini-3.1-flash-image-preview',
  'google/gemini-3-pro-image-preview',
  'openai/gpt-5-image-mini',
  'openai/gpt-5-image',
  'openai/gpt-5.4-image-2',
];

export function createFallbackCatalog(): OpenRouterModelCatalog {
  return {
    analysisModels: PREFERRED_ANALYSIS_MODEL_IDS.map((id) => createFallbackModel(id, 'analysis')),
    imageModels: PREFERRED_IMAGE_MODEL_IDS.map((id) => createFallbackModel(id, 'image')),
    source: 'fallback',
    updatedAt: new Date().toISOString(),
  };
}

export function createCatalogFromOpenRouter(models: OpenRouterRawModel[]): OpenRouterModelCatalog {
  const byId = new Map(models.map((model) => [model.id, model]));
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

  return {
    analysisModels,
    imageModels,
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
