import type {
  CompositionLayerBlendMode,
  CompositionLayerFit,
  CompositionLayerGradient,
  CompositionLayerShadow,
  CompositionTextAlign,
  CompositionTextVerticalAlign,
} from '@/entities/production-graph/model/types';

interface CompositionRenderBaseLayer {
  blendMode: CompositionLayerBlendMode;
  flipX: boolean;
  flipY: boolean;
  height: number;
  opacity: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
}

export interface CompositionRenderImageLayer extends CompositionRenderBaseLayer {
  assetName?: string;
  blob: Blob;
  fit: CompositionLayerFit;
  kind: 'image';
}

export interface CompositionRenderTextLayer extends CompositionRenderBaseLayer {
  align: CompositionTextAlign;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  gradient?: CompositionLayerGradient;
  kind: 'text';
  letterSpacing: number;
  lineHeight: number;
  text: string;
  verticalAlign: CompositionTextVerticalAlign;
}

export interface CompositionRenderRectangleLayer extends CompositionRenderBaseLayer {
  blur: number;
  color: string;
  cornerRadius: number;
  fillOpacity: number;
  gradient?: CompositionLayerGradient;
  kind: 'rectangle';
  shadow?: CompositionLayerShadow;
}

export type CompositionRenderLayer = CompositionRenderImageLayer | CompositionRenderRectangleLayer | CompositionRenderTextLayer;

export interface CompositionRenderOptions {
  background?: string;
  height: number;
  layers: CompositionRenderLayer[];
  width: number;
}
