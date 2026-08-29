import { getCompositionGradientLine, normalizeCompositionGradient, toCompositionRgba } from '@/entities/production-graph/model/composition-gradient';
import type { CompositionLayerBlendMode, CompositionLayerGradient } from '@/entities/production-graph/model/types';

interface CompositionTextFillLayer {
  color: string;
  gradient?: CompositionLayerGradient;
  height: number;
  width: number;
}

export function getCompositionTextFillStyle(context: CanvasRenderingContext2D, layer: CompositionTextFillLayer) {
  const gradient = normalizeCompositionGradient(layer.gradient);
  if (!gradient) return layer.color;
  const line = getCompositionGradientLine(layer.width, layer.height, gradient.angle);
  const canvasGradient = context.createLinearGradient(line.startX, line.startY, line.endX, line.endY);
  gradient.stops.forEach((stop) => canvasGradient.addColorStop(stop.offset, toCompositionRgba(stop.color, stop.opacity)));
  return canvasGradient;
}

export function getCanvasCompositeOperation(blendMode: CompositionLayerBlendMode): GlobalCompositeOperation {
  if (blendMode === 'multiply'
    || blendMode === 'screen'
    || blendMode === 'overlay'
    || blendMode === 'darken'
    || blendMode === 'lighten'
    || blendMode === 'color-dodge'
    || blendMode === 'color-burn'
    || blendMode === 'hard-light'
    || blendMode === 'soft-light'
    || blendMode === 'difference'
    || blendMode === 'exclusion'
    || blendMode === 'hue'
    || blendMode === 'saturation'
    || blendMode === 'color'
    || blendMode === 'luminosity') {
    return blendMode;
  }
  if (blendMode === 'plus-lighter') return 'lighter';
  return 'source-over';
}
