import type { CSSProperties } from 'react';
import type { CompositionLayerView } from '../model/composition-model-types';
import { getCompositionCssFontFamily } from './composition-font-family';

export function getCompositionTextPreviewStyle(
  style: CompositionLayerView['style'],
  canvasWidth: number,
  textGradient?: string,
): CSSProperties {
  return {
    backgroundClip: textGradient ? 'text' : undefined,
    backgroundImage: textGradient,
    color: textGradient ? 'transparent' : style.color,
    fontFamily: getCompositionCssFontFamily(style.fontFamily),
    fontKerning: 'normal',
    fontSize: toCanvasRelativeUnit(style.fontSize, canvasWidth),
    fontWeight: style.fontWeight,
    letterSpacing: toCanvasRelativeUnit((style.fontSize * style.letterSpacing) / 100, canvasWidth, true),
    lineHeight: toCanvasRelativeUnit(style.lineHeight, canvasWidth),
    textAlign: style.align,
    WebkitBackgroundClip: textGradient ? 'text' : undefined,
    WebkitTextFillColor: textGradient ? 'transparent' : undefined,
  };
}

export function getCompositionTextVerticalJustification(verticalAlign: CompositionLayerView['style']['verticalAlign']) {
  if (verticalAlign === 'center') return 'center';
  if (verticalAlign === 'bottom') return 'flex-end';
  return 'flex-start';
}

function toCanvasRelativeUnit(value: number, canvasWidth: number, allowNegative = false) {
  const relativeValue = (value / canvasWidth) * 100;
  return `${allowNegative ? relativeValue : Math.max(0, relativeValue)}cqw`;
}
