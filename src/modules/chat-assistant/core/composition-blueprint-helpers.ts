import {
  COMPOSITION_LAYER_MAX_INPUTS,
  getCompositionLayerPortId,
  getCompositionLayerPortIndex,
} from '@/entities/production-graph/model/node-definitions';
import type {
  CompositionLayerBlendMode,
  CompositionLayerGroup,
  CompositionLayerStyle,
} from '@/entities/production-graph/model/types';
import type { CompositionBlueprint } from './composition-blueprint-schema';

export interface BlueprintMetadataV1 {
  version: 1;
  groups: Record<string, { groupId: string }>;
  layers: Record<string, {
    kind: 'text' | 'image';
    portId: string;
    role: string;
    zIndex: number;
  }>;
}

export function assertAtPath(condition: unknown, path: string, message: string): asserts condition {
  if (!condition) throw new Error(`${path}: ${message}`);
}

export function readBlueprintMetadata(value: unknown): BlueprintMetadataV1 {
  if (!value || typeof value !== 'object') return { version: 1, groups: {}, layers: {} };
  const raw = value as Partial<BlueprintMetadataV1>;
  return {
    version: 1,
    groups: raw.groups && typeof raw.groups === 'object' ? structuredClone(raw.groups) : {},
    layers: raw.layers && typeof raw.layers === 'object' ? structuredClone(raw.layers) : {},
  };
}

export function isCompositionPortInRange(portId: string) {
  const index = getCompositionLayerPortIndex(portId);
  return index >= 0 && index < COMPOSITION_LAYER_MAX_INPUTS;
}

export function findMergePort(input: {
  claimedPorts: Set<string>;
  key: string;
  kind: 'text' | 'image';
  layers: CompositionLayerStyle[];
  metadata: BlueprintMetadataV1;
  name: string;
}) {
  const metadataPort = input.metadata.layers[input.key]?.portId;
  if (metadataPort && isCompositionPortInRange(metadataPort) && !input.claimedPorts.has(metadataPort)) return metadataPort;
  return input.layers.find((layer) => (
    layer.name === input.name
    && layer.kind === input.kind
    && isCompositionPortInRange(layer.id)
    && !input.claimedPorts.has(layer.id)
  ))?.id;
}

export function findFreeCompositionPort(occupiedPorts: Set<string>, claimedPorts: Set<string>, path: string) {
  for (let index = 0; index < COMPOSITION_LAYER_MAX_INPUTS; index += 1) {
    const portId = getCompositionLayerPortId(index);
    if (!occupiedPorts.has(portId) && !claimedPorts.has(portId)) return portId;
  }
  throw new Error(`${path}: Composition supports at most ${COMPOSITION_LAYER_MAX_INPUTS} layers.`);
}

export function compileLayerStyle(
  layer: CompositionBlueprint['layers'][number],
  portId: string,
  canvas: CompositionBlueprint['canvas'],
  groupIdValue: string | undefined,
): CompositionLayerStyle {
  const base: CompositionLayerStyle = {
    blendMode: (layer.blendMode ?? 'pass-through') as CompositionLayerBlendMode,
    groupId: groupIdValue,
    height: Math.max(1, Math.round(layer.frame.height * canvas.height)),
    id: portId,
    kind: layer.kind,
    locked: layer.locked ?? false,
    name: layer.name,
    opacity: layer.opacity ?? 100,
    rotation: layer.rotation ?? 0,
    visible: layer.visible ?? true,
    width: Math.max(1, Math.round(layer.frame.width * canvas.width)),
    x: Math.round(layer.frame.x * canvas.width),
    y: Math.round(layer.frame.y * canvas.height),
  };
  if (layer.kind === 'image') {
    return {
      ...base,
      fit: layer.image?.fit ?? 'fit',
      flipX: layer.image?.flipX ?? false,
      flipY: layer.image?.flipY ?? false,
      preserveAspectRatio: layer.image?.preserveAspectRatio ?? false,
    };
  }
  const fontSize = layer.text?.fontSize ?? 64;
  return {
    ...base,
    align: layer.text?.align ?? 'left',
    color: layer.text?.color ?? '#FFFFFF',
    fontFamily: layer.text?.fontFamily ?? 'Inter, Arial, sans-serif',
    fontSize,
    fontWeight: layer.text?.fontWeight ?? '700',
    gradient: layer.text?.gradient
      ? {
          angle: layer.text.gradient.angle,
          stops: layer.text.gradient.stops
            .map((stop) => ({ color: stop.color.toLowerCase(), offset: stop.offset }))
            .sort((left, right) => left.offset - right.offset),
          type: 'linear',
        }
      : undefined,
    letterSpacing: layer.text?.letterSpacing ?? 0,
    lineHeight: layer.text?.lineHeight ?? Math.round(fontSize * 1.2),
    sizingMode: layer.text?.sizingMode ?? 'fixed',
    verticalAlign: layer.text?.verticalAlign ?? 'top',
  };
}

export function mergeBlueprintGroups(input: {
  blueprint: CompositionBlueprint;
  currentGroups: CompositionLayerGroup[];
  metadata: BlueprintMetadataV1;
  portByLayerKey: Map<string, string>;
}) {
  const managedLayerIds = new Set(input.portByLayerKey.values());
  const next: CompositionLayerGroup[] = input.currentGroups.map((group) => ({
    ...group,
    itemIds: group.itemIds?.filter((id) => !managedLayerIds.has(id)),
    layerIds: group.layerIds.filter((id) => !managedLayerIds.has(id)),
  })).filter((group) => group.layerIds.length > 0 || (group.groupIds?.length ?? 0) > 0);
  input.blueprint.groups.forEach((group) => {
    const id = input.metadata.groups[group.key]?.groupId ?? getBlueprintGroupId(group.key);
    const layerIds = group.layerKeys.map((key) => input.portByLayerKey.get(key)!).filter(Boolean);
    const compiled: CompositionLayerGroup = {
      collapsed: group.collapsed ?? false,
      id,
      itemIds: [...layerIds],
      layerIds,
      locked: group.locked ?? false,
      name: group.name,
      visible: group.visible ?? true,
    };
    const index = next.findIndex((candidate) => candidate.id === id);
    if (index >= 0) next[index] = compiled;
    else next.push(compiled);
    input.metadata.groups[group.key] = { groupId: id };
  });
  return next;
}

export function buildBlueprintLayerOrder(input: {
  blueprint: CompositionBlueprint;
  currentOrder: string[];
  groups: CompositionLayerGroup[];
  portByLayerKey: Map<string, string>;
  remainingLayerIds: string[];
}) {
  const groupByLayerKey = new Map<string, string>();
  input.blueprint.groups.forEach((group) => {
    group.layerKeys.forEach((layerKey) => groupByLayerKey.set(layerKey, getBlueprintGroupId(group.key)));
  });
  const managedRootItems: string[] = [];
  for (const layer of [...input.blueprint.layers].sort((left, right) => right.zIndex - left.zIndex)) {
    const itemId = groupByLayerKey.get(layer.key) ?? input.portByLayerKey.get(layer.key)!;
    if (!managedRootItems.includes(itemId)) managedRootItems.push(itemId);
  }
  const allGroupIds = new Set(input.groups.map((group) => group.id));
  const validRemaining = [...input.currentOrder, ...input.remainingLayerIds, ...input.groups.map((group) => group.id)]
    .filter((id, index, list) => (
      !managedRootItems.includes(id)
      && (input.remainingLayerIds.includes(id) || allGroupIds.has(id))
      && list.indexOf(id) === index
    ));
  return [...managedRootItems, ...validRemaining];
}

export function getBlueprintGroupId(key: string) {
  return `group-${key}`;
}

export function toBlueprintAspectRatio(width: number, height: number) {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right);
}
