import type { ProductionLayerId } from './production-layers';
import type { ImageGenerationOptions } from '@/shared/media/image-generation-settings';
import type { ExtractAnalysisPresetId, ExtractLayerId } from './extract-analysis-profiles';
export type { ExtractAnalysisPresetId, ExtractLayerId } from './extract-analysis-profiles';

export type PresetRole = ProductionLayerId;
// Legacy preset/presets fields describe Layers; analysisPreset selects the task.
export type ExtractPresetId = 'default' | ExtractLayerId;

export interface BaseNodeData { title: string; prompt?: string }
export interface ImportImageNodeData extends BaseNodeData {
  assetId?: string;
  mediaKind?: 'image' | 'audio' | 'video';
  videoAudioTrackIndex?: number;
  videoAudioAssetId?: string;
  videoOnlyAssetId?: string;
  videoPreviewAssetId?: string;
  videoPreviewAudioTrackIndex?: number;
  videoDerivedSourceAssetId?: string;
  videoDerivedAudioTrackIndex?: number;
}

export interface ImageToTextNodeData extends BaseNodeData {
  analysisPreset?: ExtractAnalysisPresetId;
  analysisPresetDrafts?: Partial<Record<ExtractAnalysisPresetId, { presets: ExtractPresetId[]; prompt: string }>>;
  disabledLayerIds?: ExtractLayerId[];
  message?: string;
  model?: string;
  preset?: ExtractPresetId;
  presets?: ExtractPresetId[];
  result?: string;
}

export interface QrCodeNodeData extends BaseNodeData {
  backgroundColor: string;
  content: string;
  contentMode: 'url' | 'text';
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  foregroundColor: string;
  margin: number;
  message?: string;
  outputFormat: 'png';
  pixelSize: number;
  resultAssetId?: string;
  resultSignature?: string;
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
export type CompositionLayerKind = 'image' | 'rectangle' | 'text';
export type CompositionLayerBlendMode =
  | 'pass-through' | 'normal' | 'darken' | 'multiply' | 'plus-darker'
  | 'color-burn' | 'lighten' | 'screen' | 'plus-lighter' | 'color-dodge'
  | 'overlay' | 'soft-light' | 'hard-light' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity';
export type CompositionLayerSizingMode = 'auto-width' | 'auto-height' | 'fixed';
export type CompositionTextAlign = 'left' | 'center' | 'right';
export type CompositionTextVerticalAlign = 'top' | 'center' | 'bottom';
export interface CompositionGradientStop { color: string; offset: number; opacity?: number }
export interface CompositionLayerGradient {
  angle: number;
  stops: CompositionGradientStop[];
  type: 'linear';
}

export interface CompositionLayerShadow {
  blur: number;
  color: string;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface CompositionLayerStyle {
  align?: CompositionTextAlign;
  assetId?: string;
  blendMode?: CompositionLayerBlendMode;
  blur?: number;
  color?: string;
  cornerRadius?: number;
  fit?: CompositionLayerFit;
  fillOpacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: '400' | '500' | '600' | '700' | '800';
  gradient?: CompositionLayerGradient;
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
  shadow?: CompositionLayerShadow;
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

export interface GenerateImageNodeData extends BaseNodeData, ImageGenerationOptions {
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
