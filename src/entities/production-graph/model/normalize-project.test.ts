import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { normalizeProject } from './normalize-project.ts';

const textSourceA = {
  id: 'source-a',
  type: 'textPrompt',
  position: { x: 0, y: 0 },
  size: { width: 220, height: 370 },
  status: 'idle',
  data: {
    title: 'Source A',
    text: 'A',
    result: '',
    textareaHeight: 120,
    variableDisplayMode: 'source-value',
    variables: [],
  },
};

const textSourceB = {
  id: 'source-b',
  type: 'textPrompt',
  position: { x: 10, y: 0 },
  size: { width: 220, height: 370 },
  status: 'idle',
  data: {
    title: 'Source B',
    text: 'B',
    result: '',
    textareaHeight: 120,
    variableDisplayMode: 'source-value',
    variables: [],
  },
};

const textSourceC = {
  id: 'source-c',
  type: 'textPrompt',
  position: { x: 20, y: 0 },
  size: { width: 220, height: 370 },
  status: 'idle',
  data: {
    title: 'Source C',
    text: 'C',
    result: '',
    textareaHeight: 120,
    variableDisplayMode: 'source-value',
    variables: [],
  },
};

const imageSourceA = {
  id: 'image-source-a',
  type: 'importImage',
  position: { x: 0, y: 40 },
  size: { width: 280, height: 180 },
  status: 'idle',
  data: {
    title: 'Image A',
    assetId: 'image-a',
  },
};

const imageSourceB = {
  id: 'image-source-b',
  type: 'importImage',
  position: { x: 20, y: 40 },
  size: { width: 280, height: 180 },
  status: 'idle',
  data: {
    title: 'Image B',
    assetId: 'image-b',
  },
};

const imageSourceC = {
  id: 'image-source-c',
  type: 'importImage',
  position: { x: 40, y: 40 },
  size: { width: 280, height: 180 },
  status: 'idle',
  data: {
    title: 'Image C',
    assetId: 'image-c',
  },
};

const textGenerationTarget = {
  id: 'text-generation-target',
  type: 'textGeneration',
  position: { x: 120, y: 0 },
  size: { width: 280, height: 420 },
  status: 'idle',
  data: {
    title: 'Text Generation',
    model: 'google/gemini-2.5-flash',
    instruction: 'Сформируй короткий вариант.',
    outputStyle: 'plain',
    reasoning: 'low',
    result: '',
    resultTexts: [],
    activeResultIndex: -1,
  },
};

const textConcatTarget = {
  id: 'text-concat-target',
  type: 'textConcat',
  position: { x: 200, y: 0 },
  size: { width: 320, height: 430 },
  status: 'idle',
  data: {
    title: 'Concat',
    separator: 'newline',
    customSeparator: '',
    inputCount: 1,
    prefix: '',
    suffix: '',
    result: '',
  },
};

const promptTarget = {
  id: 'prompt-target',
  type: 'textPrompt',
  position: { x: 300, y: 0 },
  size: { width: 300, height: 370 },
  status: 'idle',
  data: {
    title: 'Prompt target',
    text: '',
    result: '',
    textareaHeight: 120,
    variableDisplayMode: 'source-value',
    variables: [{ id: 'variable-0', alias: 'Variable 1' }],
  },
};

const exportImageTarget = {
  id: 'export-image-target',
  type: 'exportImage',
  position: { x: 500, y: 0 },
  size: { width: 260, height: 330 },
  status: 'idle',
  data: {
    title: 'Export image',
    imageInputCount: 1,
    format: 'png',
    quality: '90',
    scale: '1',
    background: 'transparent',
  },
};

function createProject(
  edges: Array<{ id: string; sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }>,
) {
  return normalizeProject({
    version: 1,
    nodes: [
      textSourceA as never,
      textSourceB as never,
      textSourceC as never,
      imageSourceA as never,
      imageSourceB as never,
      imageSourceC as never,
      textGenerationTarget as never,
      textConcatTarget as never,
      promptTarget as never,
      exportImageTarget as never,
    ],
    edges,
    sections: [],
    assets: [],
    presets: [],
    subjects: [],
    locations: [],
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
  });
}

beforeEach(() => {
  // nothing to reset; normalizeProject is pure.
});

test('normalizeProject dedupes edges for fixed input ports during import', () => {
  const project = createProject([
    { id: 'e1', sourceNodeId: 'source-a', sourcePortId: 'text', targetNodeId: 'text-generation-target', targetPortId: 'text' },
    { id: 'e2', sourceNodeId: 'source-b', sourcePortId: 'text', targetNodeId: 'text-generation-target', targetPortId: 'text' },
  ]);

  assert.equal(project.edges.length, 1);
  assert.equal(project.edges[0].sourceNodeId, 'source-a');
  assert.equal(project.edges[0].targetPortId, 'text');
});

test('normalizeProject compacts duplicated telegram/text concat dynamic slots into separate indexes', () => {
  const project = createProject([
    { id: 'e3', sourceNodeId: 'source-a', sourcePortId: 'text', targetNodeId: 'text-concat-target', targetPortId: 'text-0' },
    { id: 'e4', sourceNodeId: 'source-b', sourcePortId: 'text', targetNodeId: 'text-concat-target', targetPortId: 'text-0' },
    { id: 'e5', sourceNodeId: 'source-c', sourcePortId: 'text', targetNodeId: 'text-concat-target', targetPortId: 'text-0' },
  ]);

  const concatEdges = project.edges.filter((edge) => edge.targetNodeId === 'text-concat-target');
  assert.equal(concatEdges.length, 3);
  assert.deepEqual(
    concatEdges.map((edge) => edge.targetPortId).sort(),
    ['text-0', 'text-1', 'text-2'],
  );
});

test('normalizeProject keeps one edge per prompt variable slot', () => {
  const project = createProject([
    { id: 'e6', sourceNodeId: 'source-a', sourcePortId: 'text', targetNodeId: 'prompt-target', targetPortId: 'variable-0' },
    { id: 'e7', sourceNodeId: 'source-b', sourcePortId: 'text', targetNodeId: 'prompt-target', targetPortId: 'variable-0' },
  ]);

  assert.equal(project.edges.length, 1);
  assert.equal(project.edges[0].sourceNodeId, 'source-a');
  assert.equal(project.edges[0].targetPortId, 'variable-0');
});

test('normalizeProject migrates legacy export image target image port to image-0 and compacts duplicates', () => {
  const project = createProject([
    { id: 'e8', sourceNodeId: 'image-source-a', sourcePortId: 'image', targetNodeId: 'export-image-target', targetPortId: 'image' },
    { id: 'e9', sourceNodeId: 'image-source-b', sourcePortId: 'image', targetNodeId: 'export-image-target', targetPortId: 'image' },
    { id: 'e10', sourceNodeId: 'image-source-c', sourcePortId: 'image', targetNodeId: 'export-image-target', targetPortId: 'image-1' },
  ]);

  const exportEdges = project.edges.filter((edge) => edge.targetNodeId === 'export-image-target');
  assert.equal(exportEdges.length, 3);
  assert.deepEqual(
    exportEdges.map((edge) => edge.targetPortId).sort(),
    ['image-0', 'image-1', 'image-2'],
  );
});

test('normalizeProject keeps renamed text generation node title after reload', () => {
  const project = createProject([]);
  const node = project.nodes.find((item) => item.id === 'text-generation-target');

  assert.equal(node?.data.title, 'Text Generation');
});

test('normalizeProject keeps renamed iterator node title after reload', () => {
  const project = normalizeProject({
    version: 1,
    nodes: [{
      id: 'iterator',
      type: 'iterator',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 430 },
      status: 'idle',
      data: {
        title: 'Question router',
        activeKind: 'text',
        activeIndex: 0,
        activeText: '',
        imageCount: 0,
        textCount: 0,
      },
    } as never],
    edges: [],
    sections: [],
    assets: [],
    presets: [],
    subjects: [],
    locations: [],
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
  });
  const iterator = project.nodes.find((node) => node.id === 'iterator');

  assert.equal(iterator?.data.title, 'Question router');
});

test('normalizeProject keeps composition settings and title after reload', () => {
  const project = normalizeProject({
    version: 1,
    nodes: [{
      id: 'composition',
      type: 'composition',
      position: { x: 0, y: 0 },
      size: { width: 510, height: 690 },
      status: 'idle',
      data: {
        title: 'Story layout',
        aspectRatio: '9:16',
        canvasWidth: 1080,
        canvasHeight: 1920,
        layerInputCount: 3,
        size: '2K',
        groups: [{
          collapsed: true,
          groupIds: ['group-2', 'missing-group'],
          id: 'group-1',
          itemIds: ['group-2', 'layer-1', 'missing-layer'],
          layerIds: ['layer-1'],
          locked: true,
          name: 'Headline group',
          visible: false,
        }, {
          id: 'group-2',
          layerIds: ['layer-2'],
          name: 'Nested group',
        }],
        layerOrder: ['group-1', 'missing-layer', 'layer-0'],
        resultSignature: 'canvas-signature-v1',
        layers: [{
          id: 'layer-1',
          kind: 'text',
          locked: true,
          x: 120,
          y: 80,
          width: 840,
          height: 220,
          opacity: 86,
          fontSize: 72,
          color: '#ffffff',
          text: 'Detached text',
          visible: false,
        }, {
          id: 'layer-2',
          assetId: 'detached-asset',
          kind: 'image',
        }],
      },
    } as never],
    edges: [],
    sections: [],
    assets: [],
    presets: [],
    subjects: [],
    locations: [],
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
  });
  const composition = project.nodes.find((node) => node.id === 'composition');
  const data = composition?.data as {
    canvasHeight?: number;
    canvasWidth?: number;
    groups?: Array<{ collapsed?: boolean; groupIds?: string[]; id?: string; itemIds?: string[]; layerIds?: string[]; locked?: boolean; name?: string; visible?: boolean }>;
    layerInputCount?: number;
    layerOrder?: string[];
    layers?: Array<{ assetId?: string; id?: string; locked?: boolean; opacity?: number; text?: string; visible?: boolean }>;
    resultSignature?: string;
    size?: string;
    title?: string;
  } | undefined;

  assert.equal(composition?.size.width, 510);
  assert.equal(data?.title, 'Story layout');
  assert.equal(data?.canvasWidth, 1080);
  assert.equal(data?.canvasHeight, 1920);
  assert.equal(data?.layerInputCount, 3);
  assert.equal(data?.size, '2K');
  assert.equal(data?.resultSignature, 'canvas-signature-v1');
  assert.deepEqual(data?.layerOrder, ['group-1', 'layer-0']);
  assert.equal(data?.groups?.[0]?.collapsed, true);
  assert.equal(data?.groups?.[0]?.id, 'group-1');
  assert.deepEqual(data?.groups?.[0]?.groupIds, ['group-2']);
  assert.deepEqual(data?.groups?.[0]?.itemIds, ['group-2', 'layer-1']);
  assert.deepEqual(data?.groups?.[0]?.layerIds, ['layer-1']);
  assert.equal(data?.groups?.[0]?.locked, true);
  assert.equal(data?.groups?.[0]?.visible, false);
  assert.deepEqual(data?.groups?.[1]?.layerIds, ['layer-2']);
  assert.equal(data?.layers?.[0]?.id, 'layer-1');
  assert.equal(data?.layers?.[0]?.locked, true);
  assert.equal(data?.layers?.[0]?.opacity, 86);
  assert.equal(data?.layers?.[0]?.text, 'Detached text');
  assert.equal(data?.layers?.[0]?.visible, false);
  assert.equal(data?.layers?.[1]?.assetId, 'detached-asset');
});

test('normalizeProject keeps markdown formatter preset and clamps formatter width', () => {
  const project = normalizeProject({
    version: 1,
    nodes: [{
      id: 'formatter',
      type: 'textFormatter',
      position: { x: 0, y: 0 },
      size: { width: 1200, height: 520 },
      status: 'idle',
      data: {
        title: 'Article formatter',
        editorHeight: 360,
        plainText: '# Заголовок',
        presetId: 'markdown',
        result: '',
        richText: '',
      },
    } as never],
    edges: [],
    sections: [],
    assets: [],
    presets: [],
    subjects: [],
    locations: [],
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
  });
  const formatter = project.nodes.find((node) => node.id === 'formatter');

  assert.equal(formatter?.size.width, 800);
  assert.equal(formatter?.data.title, 'Article formatter');
  assert.equal((formatter?.data as { presetId?: string } | undefined)?.presetId, 'markdown');
});
