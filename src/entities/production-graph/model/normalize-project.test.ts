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
