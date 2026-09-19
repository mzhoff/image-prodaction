import { normalizeExtractNode } from './normalize-extract-node';
import { getGenerationHistory, type GenerationHistoryData } from './generation-history';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, normalizeNodeSize } from './node-layout';
import {
  normalizeCompositionGroups,
  normalizeCompositionLayerOrder,
  normalizeCompositionLayers,
  normalizePositiveInteger,
} from './normalize-composition-node-data';
import { normalizeQrCodeNode } from './normalize-project-qr-code-node';
import { normalizeImportNodeData } from './normalize-import-node-data';
import { COMPOSITION_LAYER_MAX_INPUTS } from './node-definitions';
import { productionLayers } from './production-layers';
import type { ProductionNode, ProductionNodeData } from './types';
import { normalizeCurves } from '@/shared/lib/image-renderer/curves';

export function normalizeImageNode(node: ProductionNode): ProductionNode | null {
  if (node.type === 'importImage') {
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: normalizeImportNodeData(node.data),
    } as ProductionNode;
  }

  if (node.type === 'imageToText') return normalizeExtractNode(node);

  if (node.type === 'qrCode') {
    return normalizeQrCodeNode(node);
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
    const layerInputCount = normalizePositiveInteger(data.layerInputCount, 2, 2, COMPOSITION_LAYER_MAX_INPUTS);
    const layers = normalizeCompositionLayers(data.layers);
    const localLayerIds = layers.filter((layer) => layer.kind === 'rectangle').map((layer) => layer.id);
    return {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
      data: {
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        ...node.data,
        canvasWidth,
        canvasHeight: rawHeight,
        groups: normalizeCompositionGroups(data.groups, layerInputCount, localLayerIds),
        layerInputCount,
        layerOrder: normalizeCompositionLayerOrder(data.layerOrder, layerInputCount, localLayerIds),
        layers,
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
