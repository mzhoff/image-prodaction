import type {
  CompositionLayerBlendMode,
  CompositionLayerFit,
  CompositionLayerGroup,
  CompositionLayerSizingMode,
  CompositionLayerStyle,
  CompositionTextAlign,
  CompositionTextVerticalAlign,
} from './types';

export function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

export function normalizeCompositionLayers(value: unknown): CompositionLayerStyle[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CompositionLayerStyle[] => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    if (!id) return [];
    return [{
      align: normalizeTextAlign(raw.align),
      assetId: getOptionalString(raw.assetId),
      blendMode: normalizeBlendMode(raw.blendMode),
      color: typeof raw.color === 'string' ? raw.color : undefined,
      fit: normalizeLayerFit(raw.fit),
      flipX: typeof raw.flipX === 'boolean' ? raw.flipX : undefined,
      flipY: typeof raw.flipY === 'boolean' ? raw.flipY : undefined,
      fontFamily: typeof raw.fontFamily === 'string' ? raw.fontFamily : undefined,
      fontSize: normalizeOptionalNumber(raw.fontSize, 8, 240),
      fontWeight: normalizeFontWeight(raw.fontWeight),
      groupId: getOptionalString(raw.groupId),
      height: normalizeOptionalNumber(raw.height, 1, 4096),
      id,
      kind: raw.kind === 'image' || raw.kind === 'text' ? raw.kind : undefined,
      letterSpacing: normalizeOptionalNumber(raw.letterSpacing, -100, 500),
      lineHeight: normalizeOptionalNumber(raw.lineHeight, 1, 600),
      locked: typeof raw.locked === 'boolean' ? raw.locked : undefined,
      name: typeof raw.name === 'string' ? raw.name : undefined,
      opacity: normalizeOptionalNumber(raw.opacity, 0, 100),
      preserveAspectRatio: typeof raw.preserveAspectRatio === 'boolean' ? raw.preserveAspectRatio : undefined,
      rotation: normalizeOptionalNumber(raw.rotation, -360, 360),
      sizingMode: normalizeLayerSizingMode(raw.sizingMode),
      text: typeof raw.text === 'string' ? raw.text : undefined,
      verticalAlign: normalizeTextVerticalAlign(raw.verticalAlign),
      visible: typeof raw.visible === 'boolean' ? raw.visible : undefined,
      width: normalizeOptionalNumber(raw.width, 1, 4096),
      x: normalizeOptionalNumber(raw.x, -4096, 4096),
      y: normalizeOptionalNumber(raw.y, -4096, 4096),
    }];
  });
}

export function normalizeCompositionGroups(value: unknown, layerInputCount: number): CompositionLayerGroup[] {
  if (!Array.isArray(value)) return [];
  const validLayerIds = new Set(Array.from({ length: layerInputCount }, (_, index) => `layer-${index}`));
  const usedLayerIds = new Set<string>();
  const groups = value.flatMap((item): CompositionLayerGroup[] => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    const id = getOptionalString(raw.id) ?? '';
    if (!id) return [];
    const layerIds = Array.isArray(raw.layerIds) ? raw.layerIds.filter((layerId): layerId is string => (
      typeof layerId === 'string' && validLayerIds.has(layerId) && !usedLayerIds.has(layerId)
    )) : [];
    const groupIds = Array.isArray(raw.groupIds)
      ? raw.groupIds.filter((groupId): groupId is string => typeof groupId === 'string' && groupId.trim() !== id)
      : undefined;
    if (layerIds.length === 0 && !groupIds?.length) return [];
    layerIds.forEach((layerId) => usedLayerIds.add(layerId));
    return [{
      collapsed: typeof raw.collapsed === 'boolean' ? raw.collapsed : undefined,
      groupIds,
      id,
      itemIds: Array.isArray(raw.itemIds)
        ? raw.itemIds.filter((itemId): itemId is string => typeof itemId === 'string')
        : undefined,
      layerIds,
      locked: typeof raw.locked === 'boolean' ? raw.locked : undefined,
      name: getOptionalString(raw.name) ?? 'Group',
      visible: typeof raw.visible === 'boolean' ? raw.visible : undefined,
    }];
  });
  return normalizeGroupReferences(groups);
}

export function normalizeCompositionLayerOrder(value: unknown, layerInputCount: number): string[] {
  if (!Array.isArray(value)) return [];
  const validLayerIds = new Set(Array.from({ length: layerInputCount }, (_, index) => `layer-${index}`));
  const usedIds = new Set<string>();
  return value.flatMap((item): string[] => {
    if (typeof item !== 'string') return [];
    const id = item.trim();
    if (!id || usedIds.has(id) || (!validLayerIds.has(id) && !id.startsWith('group-'))) return [];
    usedIds.add(id);
    return [id];
  });
}

function normalizeGroupReferences(groups: CompositionLayerGroup[]) {
  const validGroupIds = new Set(groups.map((group) => group.id));
  const usedGroupIds = new Set<string>();
  return groups.map((group) => ({
    ...group,
    groupIds: group.groupIds?.flatMap((groupId): string[] => {
      const id = groupId.trim();
      if (!id || id === group.id || !validGroupIds.has(id) || usedGroupIds.has(id)) return [];
      usedGroupIds.add(id);
      return [id];
    }),
  })).map((group) => {
    const validItemIds = new Set([...(group.groupIds ?? []), ...group.layerIds]);
    const usedItemIds = new Set<string>();
    const itemIds = (group.itemIds ?? []).flatMap((itemId): string[] => {
      const id = itemId.trim();
      if (!id || !validItemIds.has(id) || usedItemIds.has(id)) return [];
      usedItemIds.add(id);
      return [id];
    });
    for (const id of [...(group.groupIds ?? []), ...group.layerIds]) {
      if (!usedItemIds.has(id)) itemIds.push(id);
    }
    return { ...group, itemIds };
  });
}

function normalizeOptionalNumber(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeFontWeight(value: unknown): CompositionLayerStyle['fontWeight'] {
  return value === '400' || value === '500' || value === '600' || value === '700' || value === '800'
    ? value
    : undefined;
}

function normalizeLayerFit(value: unknown): CompositionLayerFit | undefined {
  return value === 'fit' || value === 'fill' || value === 'stretch' ? value : undefined;
}

function normalizeLayerSizingMode(value: unknown): CompositionLayerSizingMode | undefined {
  return value === 'auto-width' || value === 'auto-height' || value === 'fixed' ? value : undefined;
}

function normalizeBlendMode(value: unknown): CompositionLayerBlendMode | undefined {
  const supported: CompositionLayerBlendMode[] = [
    'pass-through', 'normal', 'darken', 'multiply', 'plus-darker', 'color-burn',
    'lighten', 'screen', 'plus-lighter', 'color-dodge', 'overlay', 'soft-light',
    'hard-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
  ];
  return supported.includes(value as CompositionLayerBlendMode) ? value as CompositionLayerBlendMode : undefined;
}

function normalizeTextAlign(value: unknown): CompositionTextAlign | undefined {
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined;
}

function normalizeTextVerticalAlign(value: unknown): CompositionTextVerticalAlign | undefined {
  return value === 'top' || value === 'center' || value === 'bottom' ? value : undefined;
}
