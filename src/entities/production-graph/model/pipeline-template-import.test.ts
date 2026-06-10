import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { PROJECT_SCHEMA_VERSION, createEmptyProjectUiState } from './project-schema.ts';
import type { ProductionGraphState } from './store-types.ts';
import { useProductionGraphStore } from './use-production-graph-store.ts';

const BASE_GRAPH_STATE = {
  version: PROJECT_SCHEMA_VERSION,
  nodes: [
    {
      id: 'existing-preview',
      type: 'preview',
      position: { x: 0, y: 0 },
      size: { width: 260, height: 300 },
      status: 'idle' as const,
      data: { title: 'Preview' },
    },
  ],
  sections: [],
  edges: [],
  assets: [],
  presets: [],
  subjects: [],
  locations: [],
  publications: [],
  runs: [],
  selectedNodeIds: [],
  selectedSectionIds: [],
};

const PIPELINE_TEMPLATE = {
  kind: 'pipelineTemplate',
  schemaVersion: PROJECT_SCHEMA_VERSION,
  exportedAt: '2026-01-01T12:00:00.000Z',
  project: {
    version: PROJECT_SCHEMA_VERSION,
    nodes: [
      {
        id: 'prompt-a',
        type: 'textPrompt',
        position: { x: 100, y: 50 },
        size: { width: 360, height: 260 },
        status: 'idle',
        data: {
          title: 'Prompt',
          text: 'Write a compact image prompt.',
          variableDisplayMode: 'source-value',
          variables: [],
        },
      },
      {
        id: 'generation-b',
        type: 'textGeneration',
        position: { x: 420, y: 80 },
        size: { width: 360, height: 520 },
        status: 'idle',
        data: {
          title: 'Text Gen',
          instruction: 'Rewrite as a production prompt.',
          model: 'google/gemini-2.5-flash',
          outputStyle: 'plain',
          temperature: 1,
        },
      },
    ],
    sections: [
      {
        id: 'section-a',
        title: 'Pipeline Group',
        position: { x: 80, y: 40 },
        size: { width: 760, height: 620 },
      },
    ],
    edges: [
      {
        id: 'edge-a',
        sourceNodeId: 'prompt-a',
        sourcePortId: 'text',
        targetNodeId: 'generation-b',
        targetPortId: 'text',
      },
    ],
    assets: [
      {
        id: 'asset-should-be-stripped',
        kind: 'image',
        name: 'asset.png',
        mimeType: 'image/png',
        createdAt: '2026-01-01T12:00:00.000Z',
        storage: { type: 'indexeddb', blobKey: 'asset-should-be-stripped' },
      },
    ],
    presets: [],
    subjects: [],
    locations: [],
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
  },
  uiState: {
    ...createEmptyProjectUiState(),
    nodes: {
      'prompt-a': { state: 'Collapsed' },
    },
  },
};

function resetStore() {
  useProductionGraphStore.setState({
    ...BASE_GRAPH_STATE,
    historyPast: [],
    historyFuture: [],
    uiState: createEmptyProjectUiState(),
  } as Partial<ProductionGraphState>);
}

beforeEach(resetStore);

test('importPipelineTemplateAt appends remapped pipeline at requested origin', () => {
  const result = useProductionGraphStore.getState().importPipelineTemplateAt(PIPELINE_TEMPLATE, { x: 1000, y: 2000 });
  const state = useProductionGraphStore.getState();
  const importedNodes = state.nodes.filter((node) => node.id !== 'existing-preview');
  const importedPrompt = importedNodes.find((node) => node.type === 'textPrompt');
  const importedGeneration = importedNodes.find((node) => node.type === 'textGeneration');

  assert.equal(result.nodeCount, 2);
  assert.equal(state.nodes.length, 3);
  assert.equal(state.assets.length, 0);
  assert.equal(state.historyPast.length, 1);
  assert.equal(importedNodes.length, 2);
  assert.ok(importedPrompt);
  assert.ok(importedGeneration);
  assert.notEqual(importedPrompt.id, 'prompt-a');
  assert.notEqual(importedGeneration.id, 'generation-b');
  assert.deepEqual(importedPrompt.position, { x: 1020, y: 2010 });
  assert.deepEqual(state.sections[0]?.position, { x: 1000, y: 2000 });
  assert.equal(state.edges.length, 1);
  assert.equal(state.edges[0]?.sourceNodeId, importedPrompt.id);
  assert.equal(state.edges[0]?.targetNodeId, importedGeneration.id);
  assert.deepEqual(state.selectedNodeIds.sort(), importedNodes.map((node) => node.id).sort());
  assert.equal(state.uiState.nodes[importedPrompt.id]?.state, 'Collapsed');
});

test('exportPipelineTemplateForSection exports only section pipeline', () => {
  useProductionGraphStore.setState({
    version: PROJECT_SCHEMA_VERSION,
    nodes: [
      {
        id: 'inside-prompt',
        type: 'textPrompt',
        position: { x: 120, y: 130 },
        size: { width: 360, height: 260 },
        status: 'idle',
        data: {
          title: 'Inside Prompt',
          text: 'Template prompt text',
          variableDisplayMode: 'source-value',
          variables: [],
        },
      },
      {
        id: 'inside-generation',
        type: 'textGeneration',
        position: { x: 520, y: 140 },
        size: { width: 360, height: 520 },
        status: 'success',
        data: {
          title: 'Inside Gen',
          instruction: 'Rewrite.',
          model: 'google/gemini-2.5-flash',
          outputStyle: 'plain',
          result: 'runtime result must be stripped',
          temperature: 1,
        },
      },
      {
        id: 'outside-preview',
        type: 'preview',
        position: { x: 1200, y: 140 },
        size: { width: 260, height: 300 },
        status: 'idle',
        data: { title: 'Outside Preview' },
      },
    ],
    sections: [
      {
        id: 'section-template',
        title: 'Template Section',
        position: { x: 100, y: 100 },
        size: { width: 820, height: 720 },
      },
    ],
    edges: [
      {
        id: 'edge-inside',
        sourceNodeId: 'inside-prompt',
        sourcePortId: 'text',
        targetNodeId: 'inside-generation',
        targetPortId: 'text',
      },
      {
        id: 'edge-to-outside',
        sourceNodeId: 'inside-generation',
        sourcePortId: 'text',
        targetNodeId: 'outside-preview',
        targetPortId: 'image',
      },
    ],
    assets: [
      {
        id: 'asset-a',
        kind: 'image',
        name: 'asset.png',
        mimeType: 'image/png',
        createdAt: '2026-01-01T12:00:00.000Z',
        storage: { type: 'indexeddb', blobKey: 'asset-a' },
      },
    ],
    presets: [],
    subjects: [],
    locations: [],
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
    historyPast: [],
    historyFuture: [],
    uiState: {
      ...createEmptyProjectUiState(),
      nodes: {
        'inside-prompt': { state: 'Collapsed' },
        'outside-preview': { state: 'Expanded' },
      },
    },
  } as Partial<ProductionGraphState>);

  const exported = useProductionGraphStore.getState().exportPipelineTemplateForSection('section-template');
  const exportedNodeIds = exported.project.nodes.map((node) => node.id).sort();

  assert.equal(exported.kind, 'pipelineTemplate');
  assert.deepEqual(exportedNodeIds, ['inside-generation', 'inside-prompt']);
  assert.deepEqual(exported.project.sections.map((section) => section.id), ['section-template']);
  assert.deepEqual(exported.project.edges.map((edge) => edge.id), ['edge-inside']);
  assert.equal(exported.project.assets.length, 0);
  assert.equal(exported.project.nodes.some((node) => node.id === 'outside-preview'), false);
  assert.equal(exported.uiState.nodes['inside-prompt']?.state, 'Collapsed');
  assert.equal(exported.uiState.nodes['outside-preview'], undefined);
  const exportedGeneration = exported.project.nodes.find((node) => node.id === 'inside-generation');
  assert.ok(exportedGeneration);
  assert.equal('result' in exportedGeneration.data, false);
});
