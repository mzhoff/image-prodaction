import { createId } from '@/shared/lib/id';
import { defaultExtractPrompt } from './extract-presets';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, createDefaultNodeSize } from './node-layout';
import { productionLayers } from './production-layers';
import type { GraphPoint, ProductionNode, ProductionNodeType } from './types';

export function createDefaultNode(type: ProductionNodeType, position: GraphPoint): ProductionNode {
  const id = createId('node');
  const base = { id, type, position, status: 'idle' as const };

  if (type === 'importImage') {
    return { ...base, size: createDefaultNodeSize(type), data: { title: 'Import' } };
  }

  if (type === 'imageToText') {
    return {
      ...base,
      size: createDefaultNodeSize(type),
      data: {
        title: 'Extract',
        model: 'google/gemini-2.5-flash',
        preset: 'default',
        presets: ['default'],
        prompt: defaultExtractPrompt,
      },
    };
  }

  if (type === 'referenceComposer') {
    return {
      ...base,
      size: createDefaultNodeSize(type),
      data: {
        title: 'Generate Image',
        model: 'google/gemini-2.5-flash-image',
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        size: '1K',
        prompt: '',
        slots: productionLayers.map((layer) => ({ id: layer.id, label: layer.label })),
      },
    };
  }

  if (type === 'generateImage') {
    return {
      ...base,
      size: createDefaultNodeSize(type),
      data: {
        title: 'Generate Image',
        model: 'google/gemini-2.5-flash-image',
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        size: '1K',
        prompt: '',
        activeResultIndex: -1,
        resultAssetIds: [],
      },
    };
  }

  if (type === 'sketch') {
    return {
      ...base,
      size: createDefaultNodeSize(type),
      data: {
        title: 'Sketch',
        aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
        brushColor: '#111111',
        brushSize: '48',
      },
    };
  }

  if (type === 'cropImage') {
    return {
      ...base,
      size: createDefaultNodeSize(type),
      data: {
        title: 'Crop',
        aspectRatio: 'Custom',
        locked: false,
      },
    };
  }

  if (type === 'adjustment') {
    return {
      ...base,
      size: createDefaultNodeSize(type),
      data: {
        title: 'Adjustments',
        exposure: 0,
        gamma: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        tint: 0,
        highlights: 0,
        shadows: 0,
      },
    };
  }

  if (type === 'removeBackground') {
    return {
      ...base,
      size: createDefaultNodeSize(type),
      data: {
        title: 'Remove BG',
      },
    };
  }

  if (type === 'exportImage') {
    return {
      ...base,
      size: createDefaultNodeSize(type),
      data: {
        title: 'Export',
        format: 'png',
        quality: '90',
        scale: '1',
        background: 'transparent',
      },
    };
  }

  if (type === 'preview') {
    return { ...base, size: createDefaultNodeSize(type), data: { title: 'Preview' } };
  }

  return {
    ...base,
    size: createDefaultNodeSize(type),
    data: { title: 'Prompt', text: '' },
  };
}
