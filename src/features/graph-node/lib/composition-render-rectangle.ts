import { toCompositionRgba } from '@/entities/production-graph/model/composition-gradient';
import { getCompositionTextFillStyle } from './composition-render-styles';
import type { CompositionRenderRectangleLayer } from './composition-render-types';

export function drawCompositionRectangle(
  context: CanvasRenderingContext2D,
  layer: CompositionRenderRectangleLayer,
) {
  const radius = Math.min(Math.max(0, layer.cornerRadius), layer.width / 2, layer.height / 2);
  context.filter = layer.blur > 0 ? `blur(${layer.blur}px)` : 'none';
  if (layer.shadow && layer.shadow.opacity > 0) drawRectangleShadow(context, layer, radius);

  context.save();
  context.globalAlpha *= Math.min(1, Math.max(0, layer.fillOpacity / 100));
  context.fillStyle = getCompositionTextFillStyle(context, layer);
  addRoundedRectanglePath(context, layer.width, layer.height, radius);
  context.fill();
  context.restore();
}

function drawRectangleShadow(
  context: CanvasRenderingContext2D,
  layer: CompositionRenderRectangleLayer,
  radius: number,
) {
  const shadow = layer.shadow;
  if (!shadow) return;
  const extent = Math.max(layer.width, layer.height) + shadow.blur * 4
    + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + layer.blur * 4;
  context.save();
  context.beginPath();
  context.rect(-extent, -extent, layer.width + extent * 2, layer.height + extent * 2);
  appendRoundedRectanglePath(context, layer.width, layer.height, radius);
  context.clip('evenodd');
  context.shadowBlur = shadow.blur;
  context.shadowColor = toCompositionRgba(shadow.color, shadow.opacity);
  context.shadowOffsetX = shadow.offsetX;
  context.shadowOffsetY = shadow.offsetY;
  context.fillStyle = '#000000';
  addRoundedRectanglePath(context, layer.width, layer.height, radius);
  context.fill();
  context.restore();
}

export function addRoundedRectanglePath(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  appendRoundedRectanglePath(context, width, height, radius);
  context.closePath();
}

function appendRoundedRectanglePath(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
) {
  if (radius <= 0) {
    context.rect(0, 0, width, height);
    return;
  }
  context.moveTo(radius, 0);
  context.lineTo(width - radius, 0);
  context.quadraticCurveTo(width, 0, width, radius);
  context.lineTo(width, height - radius);
  context.quadraticCurveTo(width, height, width - radius, height);
  context.lineTo(radius, height);
  context.quadraticCurveTo(0, height, 0, height - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
}
