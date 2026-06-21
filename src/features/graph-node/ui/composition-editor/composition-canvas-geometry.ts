import type { CSSProperties } from 'react';
import type { CompositionLayerStyle } from '@/entities/production-graph/model/types';
import type { CompositionLayerView } from '../../model/use-composition-node-model';
import type { LayerBounds, ResizeHandle } from './composition-types';

export function getCompositionLayerBounds(layers: CompositionLayerView[]): LayerBounds | undefined {
  if (layers.length === 0) return undefined;
  const minX = Math.min(...layers.map((layer) => layer.style.x));
  const minY = Math.min(...layers.map((layer) => layer.style.y));
  const maxX = Math.max(...layers.map((layer) => layer.style.x + layer.style.width));
  const maxY = Math.max(...layers.map((layer) => layer.style.y + layer.style.height));
  return {
    height: Math.max(1, maxY - minY),
    width: Math.max(1, maxX - minX),
    x: minX,
    y: minY,
  };
}

export function getResizePatch(
  start: LayerBounds,
  dx: number,
  dy: number,
  handle: ResizeHandle,
  keepRatio: boolean,
): Partial<CompositionLayerStyle> {
  const left = handle.includes('w');
  const right = handle.includes('e');
  const top = handle.includes('n');
  const bottom = handle.includes('s');
  let width = Math.max(24, start.width + (left ? -dx : right ? dx : 0));
  let height = Math.max(24, start.height + (top ? -dy : bottom ? dy : 0));

  if (keepRatio) {
    const ratio = start.width / Math.max(1, start.height);
    if ((left || right) && !(top || bottom)) height = width / ratio;
    else if ((top || bottom) && !(left || right)) width = height * ratio;
    else if (Math.abs(dx) > Math.abs(dy)) height = width / ratio;
    else width = height * ratio;
  }

  return {
    height: Math.round(height),
    width: Math.round(width),
    x: Math.round(left ? start.x + start.width - width : start.x),
    y: Math.round(top ? start.y + start.height - height : start.y),
  };
}

export function scaleLayerWithinBounds(layer: LayerBounds & { id: string }, from: LayerBounds, to: LayerBounds): Partial<CompositionLayerStyle> {
  const scaleX = to.width / Math.max(1, from.width);
  const scaleY = to.height / Math.max(1, from.height);
  return {
    height: Math.max(24, Math.round(layer.height * scaleY)),
    width: Math.max(24, Math.round(layer.width * scaleX)),
    x: Math.round(to.x + (layer.x - from.x) * scaleX),
    y: Math.round(to.y + (layer.y - from.y) * scaleY),
  };
}

export function clampLayerValue(value: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)));
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRotation(value: number) {
  const normalized = value % 360;
  return normalized > 180 ? normalized - 360 : normalized < -180 ? normalized + 360 : normalized;
}

export function getAutoLayerWidth(layer: CompositionLayerView, canvasWidth: number) {
  if (layer.kind === 'image' && layer.asset?.width) return clampLayerValue(layer.asset.width, 24, canvasWidth * 2);
  const text = layer.text || layer.name;
  const longestLineLength = Math.max(1, ...text.split('\n').map((line) => line.length));
  const width = Math.ceil(longestLineLength * layer.style.fontSize * 0.58);
  return clampLayerValue(width, 24, canvasWidth * 2);
}

export function getAutoLayerHeight(layer: CompositionLayerView, canvasHeight: number) {
  if (layer.kind === 'image' && layer.asset?.height) return clampLayerValue(layer.asset.height, 24, canvasHeight * 2);
  const lineCount = Math.max(1, (layer.text || layer.name).split('\n').length);
  const height = Math.ceil(lineCount * layer.style.lineHeight);
  return clampLayerValue(height, 24, canvasHeight * 2);
}

export function toCanvasRelativeUnit(value: number, canvasWidth: number) {
  return `${Math.max(0, (value / canvasWidth) * 100)}cqw`;
}

export function getCssBlendMode(blendMode: NonNullable<CompositionLayerStyle['blendMode']>): CSSProperties['mixBlendMode'] {
  if (blendMode === 'pass-through' || blendMode === 'normal' || blendMode === 'plus-darker') return 'normal';
  if (blendMode === 'plus-lighter') return 'plus-lighter';
  return blendMode;
}

export function normalizeHexColor(value: string) {
  const normalized = value.trim().replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : 'FFFFFF';
}
