import { createId } from '@/shared/lib/id';
import { defaultExtractPrompt } from './extract-presets';
import { productionLayers } from './production-layers';
import type { GraphPoint, ProductionNode, ProductionNodeType } from './types';

export function createDefaultNode(type: ProductionNodeType, position: GraphPoint): ProductionNode {
  const id = createId('node');
  const base = { id, type, position, status: 'idle' as const };

  if (type === 'importImage') {
    return { ...base, size: { width: 286, height: 300 }, data: { title: 'Import' } };
  }

  if (type === 'imageToText') {
    return {
      ...base,
      size: { width: 348, height: 468 },
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
      size: { width: 404, height: 650 },
      data: {
        title: 'Generate Image',
        model: 'google/gemini-2.5-flash-image',
        aspectRatio: '16:9',
        size: '1K',
        prompt: '',
        slots: productionLayers.map((layer) => ({ id: layer.id, label: layer.label })),
      },
    };
  }

  if (type === 'generateImage') {
    return {
      ...base,
      size: { width: 404, height: 720 },
      data: {
        title: 'Generate Image',
        model: 'google/gemini-2.5-flash-image',
        aspectRatio: '16:9',
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
      size: { width: 360, height: 390 },
      data: {
        title: 'Sketch',
        aspectRatio: '16:9',
        brushColor: '#111111',
        brushSize: '48',
      },
    };
  }

  if (type === 'exportImage') {
    return {
      ...base,
      size: { width: 330, height: 400 },
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
    return { ...base, size: { width: 330, height: 360 }, data: { title: 'Preview' } };
  }

  return {
    ...base,
    size: { width: 300, height: 230 },
    data: { title: 'Prompt', text: '' },
  };
}
