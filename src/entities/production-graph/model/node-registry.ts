import { defaultExtractPrompt } from './extract-presets';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO } from './node-defaults';
import { productionLayers } from './production-layers';
import type { GraphPort, ProductionNodeData, ProductionNodeType } from './types';

interface ProductionNodeDefinition {
  type: ProductionNodeType;
  title: string;
  menuLabel: string;
  defaultHeight: number;
  ports: GraphPort[];
  createData: () => ProductionNodeData;
}

const layerPresetInputPorts = productionLayers.map((layer) => ({
  id: layer.id,
  label: layer.label,
  kind: 'preset' as const,
  side: 'input' as const,
})) satisfies GraphPort[];

const layerReferenceInputPorts = productionLayers.map((layer) => ({
  id: layer.id,
  label: layer.label,
  kind: 'reference' as const,
  side: 'input' as const,
})) satisfies GraphPort[];

export const NODE_DEFINITIONS = {
  importImage: {
    type: 'importImage',
    title: 'Import',
    menuLabel: 'Import image',
    defaultHeight: 300,
    ports: [{ id: 'image', label: 'Image', kind: 'image', side: 'output' }],
    createData: () => ({ title: 'Import' }),
  },
  textPrompt: {
    type: 'textPrompt',
    title: 'Prompt',
    menuLabel: 'Text prompt',
    defaultHeight: 230,
    ports: [{ id: 'text', label: 'Text', kind: 'text', side: 'output' }],
    createData: () => ({ title: 'Prompt', text: '' }),
  },
  imageToText: {
    type: 'imageToText',
    title: 'Extract',
    menuLabel: 'Extract',
    defaultHeight: 468,
    ports: [
      { id: 'image', label: 'Image', kind: 'image', side: 'input' },
      { id: 'result', label: 'Result', kind: 'text', side: 'output' },
    ],
    createData: () => ({
      title: 'Extract',
      model: 'google/gemini-2.5-flash',
      preset: 'default',
      presets: ['default'],
      prompt: defaultExtractPrompt,
    }),
  },
  referenceComposer: {
    type: 'referenceComposer',
    title: 'Generate Image',
    menuLabel: 'Reference composer',
    defaultHeight: 650,
    ports: [
      ...layerPresetInputPorts,
      { id: 'prompt', label: 'Prompt', kind: 'text', side: 'output' },
    ],
    createData: () => ({
      title: 'Generate Image',
      model: 'google/gemini-2.5-flash-image',
      aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
      size: '1K',
      prompt: '',
      slots: productionLayers.map((layer) => ({ id: layer.id, label: layer.label })),
    }),
  },
  generateImage: {
    type: 'generateImage',
    title: 'Generate Image',
    menuLabel: 'Generate image',
    defaultHeight: 720,
    ports: [
      { id: 'prompt', label: 'Prompt', kind: 'text', side: 'input' },
      { id: 'reference', label: 'Reference', kind: 'image', side: 'input' },
      ...layerReferenceInputPorts,
      { id: 'image', label: 'Image', kind: 'image', side: 'output' },
    ],
    createData: () => ({
      title: 'Generate Image',
      model: 'google/gemini-2.5-flash-image',
      aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
      size: '1K',
      prompt: '',
      activeResultIndex: -1,
      resultAssetIds: [],
    }),
  },
  sketch: {
    type: 'sketch',
    title: 'Sketch',
    menuLabel: 'Sketch',
    defaultHeight: 390,
    ports: [{ id: 'image', label: 'Image', kind: 'image', side: 'output' }],
    createData: () => ({
      title: 'Sketch',
      aspectRatio: DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO,
      brushColor: '#111111',
      brushSize: '48',
    }),
  },
  cropImage: {
    type: 'cropImage',
    title: 'Crop',
    menuLabel: 'Crop',
    defaultHeight: 638,
    ports: [
      { id: 'image', label: 'Image', kind: 'image', side: 'input' },
      { id: 'result', label: 'Image', kind: 'image', side: 'output' },
    ],
    createData: () => ({ title: 'Crop', aspectRatio: 'Custom', locked: false }),
  },
  adjustment: {
    type: 'adjustment',
    title: 'Adjustments',
    menuLabel: 'Adjustments',
    defaultHeight: 720,
    ports: [
      { id: 'image', label: 'Image', kind: 'image', side: 'input' },
      { id: 'result', label: 'Image', kind: 'image', side: 'output' },
    ],
    createData: () => ({
      title: 'Adjustments',
      exposure: 0,
      gamma: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
    }),
  },
  removeBackground: {
    type: 'removeBackground',
    title: 'Remove BG',
    menuLabel: 'Remove BG',
    defaultHeight: 360,
    ports: [
      { id: 'image', label: 'Image', kind: 'image', side: 'input' },
      { id: 'result', label: 'Image', kind: 'image', side: 'output' },
    ],
    createData: () => ({ title: 'Remove BG' }),
  },
  exportImage: {
    type: 'exportImage',
    title: 'Export',
    menuLabel: 'Export image',
    defaultHeight: 400,
    ports: [{ id: 'image', label: 'Image', kind: 'image', side: 'input' }],
    createData: () => ({
      title: 'Export',
      format: 'png',
      quality: '90',
      scale: '1',
      background: 'transparent',
    }),
  },
  preview: {
    type: 'preview',
    title: 'Preview',
    menuLabel: 'Preview',
    defaultHeight: 360,
    ports: [{ id: 'image', label: 'Image', kind: 'image', side: 'input' }],
    createData: () => ({ title: 'Preview' }),
  },
} satisfies Record<ProductionNodeType, ProductionNodeDefinition>;

export const PRODUCTION_NODE_TYPES = Object.keys(NODE_DEFINITIONS) as ProductionNodeType[];

export function getNodeDefinition(type: ProductionNodeType) {
  return NODE_DEFINITIONS[type];
}

export function createDefaultNodeData(type: ProductionNodeType) {
  return getNodeDefinition(type).createData();
}
