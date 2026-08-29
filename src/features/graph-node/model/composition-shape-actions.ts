import { COMPOSITION_LAYER_MAX_INPUTS } from '@/entities/production-graph/model/node-definitions';
import type { CompositionLayerStyle, CompositionNodeData } from '@/entities/production-graph/model/types';

export interface CompositionRectangleBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function createCompositionRectanglePatch({
  bounds,
  createId = () => globalThis.crypto.randomUUID(),
  data,
  layerInputCount,
}: {
  bounds: CompositionRectangleBounds;
  createId?: () => string;
  data: CompositionNodeData;
  layerInputCount: number;
}): Partial<CompositionNodeData> | undefined {
  const rectangles = (data.layers ?? []).filter((layer) => layer.kind === 'rectangle');
  if (layerInputCount + rectangles.length >= COMPOSITION_LAYER_MAX_INPUTS) return undefined;

  const usedIds = new Set((data.layers ?? []).map((layer) => layer.id));
  const baseId = `shape-${createId()}`;
  const id = getUniqueLayerId(baseId, usedIds);
  const layer: CompositionLayerStyle = {
    blur: 0,
    color: '#d9d9d9',
    cornerRadius: 0,
    fillOpacity: 100,
    height: Math.max(1, Math.round(bounds.height)),
    id,
    kind: 'rectangle',
    name: getRectangleName(rectangles),
    opacity: 100,
    preserveAspectRatio: false,
    visible: true,
    width: Math.max(1, Math.round(bounds.width)),
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
  };

  return {
    layerOrder: [id, ...(data.layerOrder ?? []).filter((layerId) => layerId !== id)],
    layers: [...(data.layers ?? []), layer],
    selectedGroupId: undefined,
    selectedLayerId: id,
    selectedLayerIds: [id],
  };
}

function getRectangleName(rectangles: CompositionLayerStyle[]) {
  const usedNames = new Set(rectangles.map((layer) => layer.name));
  let number = 1;
  while (usedNames.has(number === 1 ? 'Rectangle' : `Rectangle ${number}`)) number += 1;
  return number === 1 ? 'Rectangle' : `Rectangle ${number}`;
}

function getUniqueLayerId(baseId: string, usedIds: Set<string>) {
  if (!usedIds.has(baseId)) return baseId;
  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}
