import type { CSSProperties } from 'react';
import { toCompositionRgba, toCssCompositionGradient } from '@/entities/production-graph/model/composition-gradient';
import type { CompositionLayerView } from '../model/composition-model-types';

export function getCompositionRectanglePreviewStyle(
  style: CompositionLayerView['style'],
  canvasWidth: number,
): CSSProperties {
  const shadow = style.shadow;
  return {
    background: style.gradient
      ? toCssCompositionGradient(style.gradient, style.fillOpacity)
      : toCompositionRgba(style.color, style.fillOpacity),
    borderRadius: toCanvasUnit(style.cornerRadius, canvasWidth),
    boxShadow: shadow
      ? `${toCanvasUnit(shadow.offsetX, canvasWidth)} ${toCanvasUnit(shadow.offsetY, canvasWidth)} ${toCanvasUnit(shadow.blur, canvasWidth)} ${toCompositionRgba(shadow.color, shadow.opacity)}`
      : undefined,
    filter: style.blur > 0 ? `blur(${toCanvasUnit(style.blur, canvasWidth)})` : undefined,
  };
}

function toCanvasUnit(value: number, canvasWidth: number) {
  return `${(value / Math.max(1, canvasWidth)) * 100}cqw`;
}
