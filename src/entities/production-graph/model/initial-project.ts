import type { GraphProject, ProductionNode } from './types';
import { defaultExtractPrompt } from './extract-presets';

const defaultPrompt = 'Создай редакционную обложку для статьи Gigonom: современная B2B/IT-эстетика, чистая композиция, без текста, без логотипов, без интерфейсного шума. Изображение должно объяснять бизнес-смысл статьи через метафору процессов, данных, автоматизации и роста.';

export const initialNodes: ProductionNode[] = [
  {
    id: 'node-import-style',
    type: 'importImage',
    position: { x: -610, y: -210 },
    size: { width: 286, height: 300 },
    status: 'idle',
    data: {
      title: 'Import',
    },
  },
  {
    id: 'node-import-composition',
    type: 'importImage',
    position: { x: -622, y: 742 },
    size: { width: 286, height: 282 },
    status: 'idle',
    data: {
      title: 'Import',
    },
  },
  {
    id: 'node-image-to-text',
    type: 'imageToText',
    position: { x: -4, y: 718 },
    size: { width: 348, height: 468 },
    status: 'idle',
    data: {
      title: 'Extract',
      model: 'google/gemini-2.5-flash',
      preset: 'default',
      prompt: defaultExtractPrompt,
      result: '',
    },
  },
  {
    id: 'node-generator',
    type: 'generateImage',
    position: { x: 760, y: -80 },
    size: { width: 404, height: 720 },
    status: 'idle',
    data: {
      title: 'Generate Image',
      model: 'google/gemini-2.5-flash-image',
      aspectRatio: '16:9',
      size: '1K',
      prompt: defaultPrompt,
    },
  },
  {
    id: 'node-preview',
    type: 'preview',
    position: { x: 1240, y: 140 },
    size: { width: 330, height: 360 },
    status: 'idle',
    data: {
      title: 'Preview',
    },
  },
];

export const initialProject: GraphProject = {
  version: 1,
  nodes: initialNodes,
  edges: [
    {
      id: 'edge-style-to-generator',
      sourceNodeId: 'node-import-style',
      sourcePortId: 'image',
      targetNodeId: 'node-generator',
      targetPortId: 'style',
    },
    {
      id: 'edge-composition-to-text',
      sourceNodeId: 'node-import-composition',
      sourcePortId: 'image',
      targetNodeId: 'node-image-to-text',
      targetPortId: 'image',
    },
    {
      id: 'edge-text-to-composer',
      sourceNodeId: 'node-image-to-text',
      sourcePortId: 'result',
      targetNodeId: 'node-generator',
      targetPortId: 'composition',
    },
    {
      id: 'edge-generator-to-preview',
      sourceNodeId: 'node-generator',
      sourcePortId: 'image',
      targetNodeId: 'node-preview',
      targetPortId: 'image',
    },
  ],
  assets: [],
  presets: [],
  runs: [],
  selectedNodeIds: [],
};
