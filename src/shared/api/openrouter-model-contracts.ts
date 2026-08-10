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
