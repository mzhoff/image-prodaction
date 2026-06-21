import type { CompositionLayerKind, CompositionLayerStyle } from '@/entities/production-graph/model/types';
import type { CompositionLayerView } from './composition-model-types';
import type { CompositionAlignment } from './use-composition-node-model';

export function normalizeCanvasDimension(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(4096, Math.max(256, Math.round(value)))
    : fallback;
}

export function normalizeLayerStyle(
  layer: CompositionLayerStyle | undefined,
  context: { canvasHeight: number; canvasWidth: number; index: number; kind: CompositionLayerKind },
): CompositionLayerView['style'] {
  const width = context.kind === 'text'
    ? Math.round(context.canvasWidth * 0.72)
    : Math.round(context.canvasWidth * 0.82);
  const height = context.kind === 'text'
    ? Math.round(context.canvasHeight * 0.2)
    : Math.round(context.canvasHeight * 0.62);
  const x = Math.round((context.canvasWidth - width) / 2);
  const y = Math.round((context.canvasHeight - height) / 2 + context.index * 24);

  const fontSize = layer?.fontSize ?? 64;

  return {
    ...layer,
    align: layer?.align ?? 'left',
    blendMode: layer?.blendMode ?? 'pass-through',
    color: layer?.color ?? '#ffffff',
    fit: layer?.fit ?? 'fit',
    flipX: layer?.flipX ?? false,
    flipY: layer?.flipY ?? false,
    fontFamily: layer?.fontFamily ?? 'Inter, Arial, sans-serif',
    fontSize,
    fontWeight: layer?.fontWeight ?? '700',
    height: layer?.height ?? height,
    letterSpacing: layer?.letterSpacing ?? 0,
    lineHeight: layer?.lineHeight ?? getDefaultTextLineHeight(fontSize),
    locked: layer?.locked ?? false,
    opacity: layer?.opacity ?? 100,
    preserveAspectRatio: layer?.preserveAspectRatio ?? true,
    rotation: layer?.rotation ?? 0,
    sizingMode: layer?.sizingMode ?? 'fixed',
    verticalAlign: layer?.verticalAlign ?? 'top',
    visible: layer?.visible ?? true,
    width: layer?.width ?? width,
    x: layer?.x ?? x,
    y: layer?.y ?? y,
  };
}

export function getDefaultTextLineHeight(fontSize: number) {
  return Math.round(fontSize * 1.2);
}

export function upsertLayerStyle(layers: CompositionLayerStyle[] | undefined, layerId: string, patch: Partial<CompositionLayerStyle>) {
  return upsertLayerStyles(layers, [{ layerId, patch }]);
}

export function upsertLayerStyles(layers: CompositionLayerStyle[] | undefined, patches: Array<{ layerId: string; patch: Partial<CompositionLayerStyle> }>) {
  const current = layers ?? [];
  const patchById = new Map(patches.map(({ layerId, patch }) => [layerId, patch]));
  const updatedIds = new Set<string>();
  const next = current.map((layer) => {
    const patch = patchById.get(layer.id);
    if (!patch) return layer;
    updatedIds.add(layer.id);
    return { ...layer, ...patch };
  });
  for (const { layerId, patch } of patches) {
    if (!updatedIds.has(layerId)) next.push({ id: layerId, ...patch });
  }
  return next;
}

export function getAlignedLayerPatch(
  layer: CompositionLayerView,
  target: Pick<CompositionLayerView['style'], 'height' | 'width' | 'x' | 'y'>,
  alignment: CompositionAlignment,
): Partial<CompositionLayerStyle> {
  if (alignment === 'left') return { x: target.x };
  if (alignment === 'center-x') return { x: Math.round(target.x + target.width / 2 - layer.style.width / 2) };
  if (alignment === 'right') return { x: Math.round(target.x + target.width - layer.style.width) };
  if (alignment === 'top') return { y: target.y };
  if (alignment === 'center-y') return { y: Math.round(target.y + target.height / 2 - layer.style.height / 2) };
  return { y: Math.round(target.y + target.height - layer.style.height) };
}
