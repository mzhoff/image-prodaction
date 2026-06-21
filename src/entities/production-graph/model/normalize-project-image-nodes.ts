import { buildExtractPrompt, defaultExtractPrompt, normalizeExtractPresetSelection } from './extract-presets';
import { getGenerationHistory, type GenerationHistoryData } from './generation-history';
import { normalizeProductionLayerIds } from './layer-text-parser';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, normalizeNodeSize } from './node-layout';
import { productionLayers } from './production-layers';
import type { CompositionLayerBlendMode, CompositionLayerFit, CompositionLayerGroup, CompositionLayerSizingMode, CompositionLayerStyle, CompositionTextAlign, CompositionTextVerticalAlign, ExtractPresetId, ProductionNode, ProductionNodeData } from './types';
import { normalizeCurves } from '@/shared/lib/image-renderer/curves';

export function normalizeImageNode(node: ProductionNode): ProductionNode | null {
  if (node.type === 'importImage') {
    const data = node.data as ProductionNodeData;
    const { prompt: _prompt, ...nextData } = data as unknown as Record<string, unknown>;
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: { title: 'Import', ...nextData },
    } as ProductionNode;
  }

  if (node.type === 'imageToText') {
    const data = node.data as ProductionNodeData;
    const { mode: _mode, aspectRatio: _aspectRatio, size: _size, ...nextData } = data as unknown as Record<string, unknown>;
    const legacyPreset = nextData.preset === 'default' || (typeof nextData.preset === 'string' && productionLayers.some((layer) => layer.id === nextData.preset))
      ? nextData.preset as ExtractPresetId
      : 'default';
    const rawPresets = Array.isArray(nextData.presets)
      ? nextData.presets.filter((preset): preset is ExtractPresetId => typeof preset === 'string')
      : legacyPreset;
    const presets = normalizeExtractPresetSelection(rawPresets);
    const nextPrompt = presets.includes('default') ? defaultExtractPrompt : buildExtractPrompt(presets).systemPrompt;
    const storedPrompt = typeof nextData.prompt === 'string' ? nextData.prompt : '';
    const prompt = storedPrompt.trim().length > 0 && !isLegacyExtractPrompt(storedPrompt, legacyPreset)
      ? storedPrompt
      : nextPrompt;
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        model: 'google/gemini-2.5-flash',
        ...nextData,
        disabledLayerIds: normalizeProductionLayerIds(nextData.disabledLayerIds),
        preset: presets[0],
        presets,
        prompt,
        title: 'Extract',
      },
    } as ProductionNode;
  }

  if (node.type === 'referenceComposer') {
    const data = node.data as ProductionNodeData & { slots?: unknown };
    const slots = Array.isArray(data.slots)
      ? data.slots
      : productionLayers.map((layer) => ({ id: layer.id, label: layer.label }));
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        model: 'google/gemini-2.5-flash-image',
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        size: '1K',
        prompt: '',
        ...data,
        slots,
        title: 'Generate Image',
      },
    } as ProductionNode;
  }

  if (node.type === 'composition') {
    const data = node.data as ProductionNodeData & {
      canvasHeight?: unknown;
      canvasWidth?: unknown;
      groups?: unknown;
      layerInputCount?: unknown;
      layerOrder?: unknown;
      layers?: unknown;
      resultSignature?: unknown;
      size?: unknown;
    };
    const canvasWidth = normalizePositiveInteger(data.canvasWidth, 1080, 256, 4096);
    const rawHeight = normalizePositiveInteger(data.canvasHeight, 1080, 256, 4096);
    const layerInputCount = normalizePositiveInteger(data.layerInputCount, 2, 2, 12);
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        ...node.data,
        canvasWidth,
        canvasHeight: rawHeight,
        groups: normalizeCompositionGroups(data.groups, layerInputCount),
        layerInputCount,
        layerOrder: normalizeCompositionLayerOrder(data.layerOrder, layerInputCount),
        layers: normalizeCompositionLayers(data.layers),
        resultSignature: typeof data.resultSignature === 'string' ? data.resultSignature : undefined,
        size: typeof data.size === 'string' && data.size.trim() ? data.size : '1K',
        title: typeof node.data.title === 'string' && node.data.title.trim() ? node.data.title : 'Composition',
      },
    } as ProductionNode;
  }

  if (node.type === 'generateImage') {
    const data = node.data as ProductionNodeData;
    const { site: _site, ...nextData } = data as unknown as Record<string, unknown>;
    const history = getGenerationHistory(nextData as unknown as GenerationHistoryData);
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        model: 'google/gemini-2.5-flash-image',
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        size: '1K',
        ...nextData,
        activeResultIndex: history.activeIndex,
        resultAssetId: history.activeAssetId,
        resultAssetIds: history.assetIds,
        title: 'Generate Image',
      },
    } as ProductionNode;
  }

  if (node.type === 'exportImage') {
    const data = node.data as { imageInputCount?: unknown };
    const imageInputCount = typeof data.imageInputCount === 'number' && Number.isFinite(data.imageInputCount)
      ? Math.max(1, Math.min(10, Math.floor(data.imageInputCount)))
      : 1;
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        imageInputCount,
        format: 'png',
        quality: '90',
        scale: '1',
        background: 'transparent',
        ...node.data,
        title: 'Export',
      },
    } as ProductionNode;
  }

  if (node.type === 'sketch') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        brushColor: '#111111',
        brushSize: '48',
        ...node.data,
        title: 'Sketch',
      },
    } as ProductionNode;
  }

  if (node.type === 'cropImage') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        aspectRatio: 'Custom',
        locked: false,
        ...node.data,
        title: 'Crop',
      },
    } as ProductionNode;
  }

  if (node.type === 'adjustment') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        exposure: 0,
        gamma: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        tint: 0,
        highlights: 0,
        shadows: 0,
        ...node.data,
        title: 'Adjustments',
      },
    } as ProductionNode;
  }

  if (node.type === 'curves') {
    const data = node.data as ProductionNodeData & { curves?: Parameters<typeof normalizeCurves>[0]; opacity?: number };
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        activeChannel: 'master',
        ...node.data,
        curves: normalizeCurves(data.curves),
        opacity: typeof data.opacity === 'number' && Number.isFinite(data.opacity) ? Math.min(100, Math.max(0, Math.round(data.opacity))) : 100,
        title: 'Curves',
      },
    } as ProductionNode;
  }

  if (node.type === 'frequencyRetouch') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        radius: 8,
        rednessReduction: 20,
        textureAmount: 100,
        toneSmoothing: 45,
        ...node.data,
        title: 'Retouch',
      },
    } as ProductionNode;
  }

  if (node.type === 'refineImage') {
    const history = getGenerationHistory(node.data as unknown as GenerationHistoryData);
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        model: 'google/gemini-2.5-flash-image',
        mode: 'reference-cleanup',
        preserveStrength: 'strict',
        size: '2K',
        instruction: '',
        ...node.data,
        activeResultIndex: history.activeIndex,
        resultAssetId: history.activeAssetId,
        resultAssetIds: history.assetIds,
        title: 'Refine',
      },
    } as ProductionNode;
  }

  if (node.type === 'removeBackground') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        ...node.data,
        title: 'Remove BG',
      },
    } as ProductionNode;
  }

  if (node.type === 'preview') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        ...node.data,
        title: 'Preview',
      },
    } as ProductionNode;
  }

  if (node.type === 'banner') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        ...node.data,
        title: typeof node.data.title === 'string' && node.data.title.trim() ? node.data.title : 'Banner',
      },
    } as ProductionNode;
  }

  return null;
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function normalizeCompositionLayers(value: unknown): CompositionLayerStyle[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CompositionLayerStyle[] => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    if (!id) return [];
    return [{
      align: normalizeTextAlign(raw.align),
      assetId: typeof raw.assetId === 'string' && raw.assetId.trim() ? raw.assetId.trim() : undefined,
      blendMode: normalizeBlendMode(raw.blendMode),
      color: typeof raw.color === 'string' ? raw.color : undefined,
      fit: normalizeLayerFit(raw.fit),
      flipX: typeof raw.flipX === 'boolean' ? raw.flipX : undefined,
      flipY: typeof raw.flipY === 'boolean' ? raw.flipY : undefined,
      fontFamily: typeof raw.fontFamily === 'string' ? raw.fontFamily : undefined,
      fontSize: normalizeOptionalNumber(raw.fontSize, 8, 240),
      fontWeight: raw.fontWeight === '400' || raw.fontWeight === '500' || raw.fontWeight === '600' || raw.fontWeight === '700' || raw.fontWeight === '800' ? raw.fontWeight : undefined,
      groupId: typeof raw.groupId === 'string' && raw.groupId.trim() ? raw.groupId.trim() : undefined,
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

function normalizeCompositionGroups(value: unknown, layerInputCount: number): CompositionLayerGroup[] {
  if (!Array.isArray(value)) return [];
  const validLayerIds = new Set(Array.from({ length: layerInputCount }, (_, index) => `layer-${index}`));
  const usedLayerIds = new Set<string>();
  const groups = value.flatMap((item): CompositionLayerGroup[] => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    if (!id) return [];
    const layerIds = Array.isArray(raw.layerIds) ? raw.layerIds.filter((layerId): layerId is string => (
      typeof layerId === 'string' && validLayerIds.has(layerId) && !usedLayerIds.has(layerId)
    )) : [];
    const rawGroupIds = Array.isArray(raw.groupIds)
      ? raw.groupIds.filter((groupId): groupId is string => typeof groupId === 'string' && groupId.trim() !== id)
      : undefined;
    if (layerIds.length === 0 && !rawGroupIds?.length) return [];
    layerIds.forEach((layerId) => usedLayerIds.add(layerId));
    return [{
      collapsed: typeof raw.collapsed === 'boolean' ? raw.collapsed : undefined,
      groupIds: rawGroupIds,
      id,
      itemIds: Array.isArray(raw.itemIds) ? raw.itemIds.filter((itemId): itemId is string => typeof itemId === 'string') : undefined,
      layerIds,
      locked: typeof raw.locked === 'boolean' ? raw.locked : undefined,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Group',
      visible: typeof raw.visible === 'boolean' ? raw.visible : undefined,
    }];
  });
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

function normalizeCompositionLayerOrder(value: unknown, layerInputCount: number): string[] {
  if (!Array.isArray(value)) return [];
  const validLayerIds = new Set(Array.from({ length: layerInputCount }, (_, index) => `layer-${index}`));
  const usedIds = new Set<string>();
  return value.flatMap((item): string[] => {
    if (typeof item !== 'string') return [];
    const id = item.trim();
    if (!id || usedIds.has(id)) return [];
    if (!validLayerIds.has(id) && !id.startsWith('group-')) return [];
    usedIds.add(id);
    return [id];
  });
}

function normalizeOptionalNumber(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;
}

function normalizeLayerFit(value: unknown): CompositionLayerFit | undefined {
  return value === 'fit' || value === 'fill' || value === 'stretch' ? value : undefined;
}

function normalizeLayerSizingMode(value: unknown): CompositionLayerSizingMode | undefined {
  return value === 'auto-width' || value === 'auto-height' || value === 'fixed' ? value : undefined;
}

function normalizeBlendMode(value: unknown): CompositionLayerBlendMode | undefined {
  return value === 'pass-through'
    || value === 'normal'
    || value === 'darken'
    || value === 'multiply'
    || value === 'plus-darker'
    || value === 'color-burn'
    || value === 'lighten'
    || value === 'screen'
    || value === 'plus-lighter'
    || value === 'color-dodge'
    || value === 'overlay'
    || value === 'soft-light'
    || value === 'hard-light'
    || value === 'difference'
    || value === 'exclusion'
    || value === 'hue'
    || value === 'saturation'
    || value === 'color'
    || value === 'luminosity'
    ? value
    : undefined;
}

function normalizeTextAlign(value: unknown): CompositionTextAlign | undefined {
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined;
}

function normalizeTextVerticalAlign(value: unknown): CompositionTextVerticalAlign | undefined {
  return value === 'top' || value === 'center' || value === 'bottom' ? value : undefined;
}

function isLegacyExtractPrompt(prompt: string, preset: ExtractPresetId) {
  const trimmed = prompt.trim();
  if (preset !== 'default') {
    return productionLayers.some((layer) => layer.id === preset && layer.prompt.trim() === trimmed);
  }

  return trimmed.includes('[SUBJECT / PRODUCT]')
    && trimmed.includes('[NEGATIVE CONSTRAINTS]')
    && trimmed.includes('Сделай максимально подробный production-ready prompt')
    || trimmed.includes('[REFERENCE EXCLUSIONS FOR UNSELECTED LAYERS]')
    || trimmed.includes('[GLOBAL NEGATIVE CONSTRAINTS]')
    || trimmed.includes('[ROUTING]');
}
