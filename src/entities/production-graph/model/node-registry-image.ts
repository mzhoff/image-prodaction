import { defaultExtractPrompt } from './extract-presets';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO } from './node-defaults';
import type { ProductionNodeDefinitionMap } from './node-registry-types';
import { productionLayers } from './production-layers';
import type { GraphPort } from './types';
import { createDefaultCurves } from '@/shared/lib/image-renderer/curves';

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

export const imageNodeDefinitions = {
  importImage: {
    type: 'importImage',
    title: 'Import',
    menuLabel: 'Import image',
    defaultHeight: 300,
    ports: [{ id: 'image', label: 'Image', kind: 'image', side: 'output' }],
    createData: () => ({ title: 'Import' }),
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
  curves: {
    type: 'curves',
    title: 'Curves',
    menuLabel: 'Curves',
    defaultHeight: 690,
    ports: [
      { id: 'image', label: 'Image', kind: 'image', side: 'input' },
      { id: 'result', label: 'Image', kind: 'image', side: 'output' },
    ],
    createData: () => ({
      title: 'Curves',
      activeChannel: 'master',
      curves: createDefaultCurves(),
      opacity: 100,
    }),
  },
  frequencyRetouch: {
    type: 'frequencyRetouch',
    title: 'Retouch',
    menuLabel: 'Frequency retouch',
    defaultHeight: 500,
    ports: [
      { id: 'image', label: 'Image', kind: 'image', side: 'input' },
      { id: 'result', label: 'Image', kind: 'image', side: 'output' },
    ],
    createData: () => ({
      title: 'Retouch',
      radius: 8,
      rednessReduction: 20,
      textureAmount: 100,
      toneSmoothing: 45,
    }),
  },
  refineImage: {
    type: 'refineImage',
    title: 'Refine',
    menuLabel: 'Refine / Enhance',
    defaultHeight: 542,
    ports: [
      { id: 'image', label: 'Image', kind: 'image', side: 'input' },
      { id: 'result', label: 'Image', kind: 'image', side: 'output' },
    ],
    createData: () => ({
      title: 'Refine',
      model: 'google/gemini-2.5-flash-image',
      mode: 'reference-cleanup',
      preserveStrength: 'strict',
      size: '2K',
      instruction: '',
      activeResultIndex: -1,
      resultAssetIds: [],
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
    ports: [{ id: 'image-0', label: 'Image 1', kind: 'image', side: 'input' }],
    createData: () => ({
      title: 'Export',
      imageInputCount: 1,
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
} satisfies ProductionNodeDefinitionMap<
  | 'importImage'
  | 'imageToText'
  | 'referenceComposer'
  | 'generateImage'
  | 'sketch'
  | 'cropImage'
  | 'adjustment'
  | 'curves'
  | 'frequencyRetouch'
  | 'refineImage'
  | 'removeBackground'
  | 'exportImage'
  | 'preview'
>;
