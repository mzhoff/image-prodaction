import type { ProductionLayerId } from './production-layers';

export type PresetRole = ProductionLayerId;
export type ExtractPresetId = 'default' | ProductionLayerId;

export interface BaseNodeData { title: string; prompt?: string }
export interface ImportImageNodeData extends BaseNodeData { assetId?: string }

export interface ImageToTextNodeData extends BaseNodeData {
  disabledLayerIds?: ProductionLayerId[];
  message?: string;
  model?: string;
  preset?: ExtractPresetId;
  presets?: ExtractPresetId[];
  result?: string;
}

export interface ReferenceComposerNodeData extends BaseNodeData {
  model?: string;
  site?: string;
  aspectRatio?: string;
  size?: string;
  slots: Array<{ id: PresetRole; label: string; value?: string }>;
  composedPrompt?: string;
}

export interface GenerationResultMetadata { aspectRatio?: string; model?: string; size?: string }
export type CompositionLayerFit = 'fit' | 'fill' | 'stretch';
export type CompositionLayerKind = 'image' | 'text';
export type CompositionLayerBlendMode =
  | 'pass-through' | 'normal' | 'darken' | 'multiply' | 'plus-darker'
  | 'color-burn' | 'lighten' | 'screen' | 'plus-lighter' | 'color-dodge'
  | 'overlay' | 'soft-light' | 'hard-light' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity';
export type CompositionLayerSizingMode = 'auto-width' | 'auto-height' | 'fixed';
export type CompositionTextAlign = 'left' | 'center' | 'right';
export type CompositionTextVerticalAlign = 'top' | 'center' | 'bottom';

export interface CompositionLayerStyle {
  align?: CompositionTextAlign;
  assetId?: string;
  blendMode?: CompositionLayerBlendMode;
  color?: string;
  fit?: CompositionLayerFit;
  flipX?: boolean;
  flipY?: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: '400' | '500' | '600' | '700' | '800';
  groupId?: string;
  height?: number;
  id: string;
  kind?: CompositionLayerKind;
  letterSpacing?: number;
  lineHeight?: number;
  locked?: boolean;
  name?: string;
  opacity?: number;
  preserveAspectRatio?: boolean;
  rotation?: number;
  sizingMode?: CompositionLayerSizingMode;
  text?: string;
  verticalAlign?: CompositionTextVerticalAlign;
  visible?: boolean;
  width?: number;
  x?: number;
  y?: number;
}

export interface CompositionLayerGroup {
  collapsed?: boolean;
  groupIds?: string[];
  id: string;
  itemIds?: string[];
  layerIds: string[];
  locked?: boolean;
  name: string;
  visible?: boolean;
}

export interface CompositionNodeData extends BaseNodeData {
  aspectRatio: string;
  canvasHeight: number;
  canvasWidth: number;
  groups?: CompositionLayerGroup[];
  layerInputCount?: number;
  layerOrder?: string[];
  layers?: CompositionLayerStyle[];
  message?: string;
  selectedGroupId?: string;
  resultAssetId?: string;
  resultSignature?: string;
  selectedLayerId?: string;
  selectedLayerIds?: string[];
  size?: string;
}

export interface GenerateImageNodeData extends BaseNodeData {
  model: string;
  aspectRatio: string;
  size: string;
  activeResultIndex?: number;
  resultAssetId?: string;
  resultAssetIds?: string[];
  resultMetadata?: Record<string, GenerationResultMetadata>;
  generationRequest?: { fingerprint: string; idempotencyKey: string; jobId?: string };
  editGenerationRequest?: { fingerprint: string; idempotencyKey: string };
  message?: string;
}
