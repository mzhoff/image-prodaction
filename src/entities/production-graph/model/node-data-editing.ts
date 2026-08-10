import type { BaseNodeData, GenerationResultMetadata } from './node-data-image';

export interface SketchNodeData extends BaseNodeData {
  aspectRatio: string; assetId?: string; brushColor: string; brushSize: string;
}
export interface CropRect { x: number; y: number; width: number; height: number }
export interface CropImageNodeData extends BaseNodeData {
  aspectRatio: string; crop?: CropRect; cropStateVersion?: number; locked: boolean;
  resultAssetId?: string; message?: string; sourceAspectRatio?: number; sourceAssetId?: string;
}
export interface RemoveBackgroundNodeData extends BaseNodeData { resultAssetId?: string; message?: string }
export interface AdjustmentNodeData extends BaseNodeData {
  exposure: number; gamma: number; contrast: number; saturation: number; temperature: number;
  tint: number; highlights: number; shadows: number; resultAssetId?: string; message?: string;
  sourceAspectRatio?: number; sourceAssetId?: string;
}
export interface CurvesNodeData extends BaseNodeData {
  activeChannel?: 'master' | 'red' | 'green' | 'blue';
  curves?: {
    master?: Array<{ id: string; x: number; y: number }>;
    red?: Array<{ id: string; x: number; y: number }>;
    green?: Array<{ id: string; x: number; y: number }>;
    blue?: Array<{ id: string; x: number; y: number }>;
  };
  maskDataUrl?: string; message?: string; opacity: number; resultAssetId?: string;
  sourceAspectRatio?: number; sourceAssetId?: string;
}
export interface FrequencyRetouchNodeData extends BaseNodeData {
  maskDataUrl?: string; radius: number; rednessReduction: number; resultAssetId?: string;
  sourceAspectRatio?: number; sourceAssetId?: string; message?: string;
  textureAmount: number; toneSmoothing: number;
}
export type RefineImageMode = 'reference-cleanup' | 'detail-boost' | 'high-res-redraw';
export type RefinePreserveStrength = 'strict' | 'balanced' | 'creative';
export interface RefineImageNodeData extends BaseNodeData {
  activeResultIndex?: number; instruction: string; mode: RefineImageMode; model: string;
  preserveStrength: RefinePreserveStrength; resultAssetId?: string; resultAssetIds?: string[];
  resultMetadata?: Record<string, GenerationResultMetadata>;
  generationRequest?: { fingerprint: string; idempotencyKey: string };
  size: string; sourceAspectRatio?: number; sourceAssetId?: string; message?: string;
}
export interface PreviewNodeData extends BaseNodeData { assetId?: string }
export interface BannerNodeData extends BaseNodeData { assetId?: string; message?: string }
export type ExportImageFormat = 'png' | 'jpeg' | 'webp';
export type ExportImageScale = '1' | '0.75' | '0.5' | '0.25';
export type ExportImageBackground = 'transparent' | 'white' | 'black';
export interface ExportImageNodeData extends BaseNodeData {
  imageInputCount?: number; format: ExportImageFormat; quality: string;
  scale: ExportImageScale; background: ExportImageBackground;
}
