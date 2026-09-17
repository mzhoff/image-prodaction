import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { initialProject } from './initial-project';
import { normalizeProjectEdge } from './normalize-project-edges';
import { normalizeProject } from './normalize-project';
import { createPipelineTemplateExport, normalizeDocumentSnapshot, normalizePortableProjectExport } from './project-portability';
import { createEmptyProjectUiState, createProjectExport } from './project-schema';
import { useProductionGraphStore } from './use-production-graph-store';
import type { GraphProject } from './types';

function fixture(): GraphProject {
  const imports = Array.from({ length: 4 }, (_, index) => ({ ...createDefaultNode('importImage', { x: index * 320, y: 0 }), id: `reference-${index}` }));
  const generate = { ...createDefaultNode('generateImage', { x: 600, y: 400 }), id: 'generate' };
  const style = { ...createDefaultNode('textPrompt', { x: 0, y: 400 }), id: 'style-text' };
  return { ...structuredClone(initialProject), nodes: [...imports, generate, style], edges: [
    ...imports.map((source, index) => ({ id: `image-edge-${index}`, sourceNodeId: source.id, sourcePortId: 'image', targetNodeId: generate.id, targetPortId: index === 3 ? 'style' : 'reference' })),
    { id: 'style-text-edge', sourceNodeId: style.id, sourcePortId: 'text', targetNodeId: generate.id, targetPortId: 'style' },
  ] };
}

test('edge normalization preserves the explicit general Reference and intentional Style inputs', () => {
  const project = fixture();
  for (const edge of project.edges) assert.deepEqual(normalizeProjectEdge(edge, project.nodes), edge);
});

test('three general image references survive repeated project normalization without becoming Style', () => {
  const project = fixture();
  let normalized = project;
  for (let index = 0; index < 3; index++) {
    normalized = normalizeProject(JSON.parse(JSON.stringify(normalized)));
    assert.deepEqual(normalized.edges, project.edges);
  }
});

test('same-document reload, portable JSON import and pipeline template keep distinct reference slots', () => {
  const project = fixture();
  const ui = createEmptyProjectUiState();
  const snapshot = JSON.parse(JSON.stringify(createProjectExport(project, ui)));
  assert.deepEqual(normalizeDocumentSnapshot(snapshot).project.edges, project.edges);
  assert.deepEqual(normalizePortableProjectExport(snapshot).project.edges, project.edges);
  const template = createPipelineTemplateExport(project, ui);
  assert.deepEqual(template.project.edges, project.edges);
  assert.deepEqual(normalizePortableProjectExport(JSON.parse(JSON.stringify(template))).project.edges, project.edges);
});

test('store reload after editing, collapse, undo/redo and recovery does not retarget connections', () => {
  const project = fixture();
  useProductionGraphStore.setState({ ...project, uiState: createEmptyProjectUiState(), historyPast: [], historyFuture: [] });
  try {
    const store = useProductionGraphStore.getState();
    store.updateNodeData('generate', { title: 'Edited generator' });
    store.setNodeUiState('generate', { collapsed: true });
    store.undo();
    store.redo();
    const saved = JSON.parse(JSON.stringify(store.exportDocumentSnapshot()));
    assert.deepEqual(saved.project.edges, project.edges);
    store.restoreDocumentSnapshot(saved);
    assert.deepEqual(useProductionGraphStore.getState().edges, project.edges);
    store.restoreDocumentSnapshot(JSON.parse(JSON.stringify(store.exportDocumentSnapshot())));
    assert.deepEqual(useProductionGraphStore.getState().edges, project.edges);
  } finally {
    useProductionGraphStore.setState({ ...structuredClone(initialProject), uiState: createEmptyProjectUiState(), historyPast: [], historyFuture: [] });
  }
});
