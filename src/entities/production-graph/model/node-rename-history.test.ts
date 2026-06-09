import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createEmptyProjectUiState } from './project-schema.ts';
import { useProductionGraphStore } from './use-production-graph-store.ts';
import type { ProductionGraphState } from './store-types.ts';

const TARGET_NODE_ID = 'node-preview';
const BASE_GRAPH_STATE = {
  version: 1,
  nodes: [
    {
      id: TARGET_NODE_ID,
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

function resetStore() {
  useProductionGraphStore.setState({
    ...BASE_GRAPH_STATE,
    historyPast: [],
    historyFuture: [],
    uiState: createEmptyProjectUiState(),
  } as Partial<ProductionGraphState>);
}

function getNodeTitle(nodeId: string) {
  const node = useProductionGraphStore.getState().nodes.find((item) => item.id === nodeId);
  assert.ok(node);
  return node.data.title;
}

beforeEach(resetStore);

test('renameNode keeps title trimmed and adds undo snapshot', () => {
  const beforeTitle = getNodeTitle(TARGET_NODE_ID);

  useProductionGraphStore.getState().renameNode(TARGET_NODE_ID, '  Новый текстовый блок  ');

  assert.equal(getNodeTitle(TARGET_NODE_ID), 'Новый текстовый блок');
  assert.equal(useProductionGraphStore.getState().historyPast.length, 1);
  assert.equal(useProductionGraphStore.getState().historyFuture.length, 0);
  assert.notEqual(getNodeTitle(TARGET_NODE_ID), beforeTitle);
});

test('empty rename should not change title and should not create history entry', () => {
  const beforeTitle = getNodeTitle(TARGET_NODE_ID);

  useProductionGraphStore.getState().renameNode(TARGET_NODE_ID, '   ');

  assert.equal(getNodeTitle(TARGET_NODE_ID), beforeTitle);
  assert.equal(useProductionGraphStore.getState().historyPast.length, 0);
  assert.equal(useProductionGraphStore.getState().historyFuture.length, 0);
});

test('undo returns previous title and redo restores renamed title', () => {
  useProductionGraphStore.getState().renameNode(TARGET_NODE_ID, 'Старая версия');
  const renamedTitle = getNodeTitle(TARGET_NODE_ID);

  useProductionGraphStore.getState().undo();
  assert.equal(getNodeTitle(TARGET_NODE_ID), 'Preview');

  useProductionGraphStore.getState().redo();
  assert.equal(getNodeTitle(TARGET_NODE_ID), renamedTitle);
});

test('new rename after undo clears redo history', () => {
  useProductionGraphStore.getState().renameNode(TARGET_NODE_ID, 'Версия 1');
  useProductionGraphStore.getState().undo();
  assert.equal(useProductionGraphStore.getState().historyFuture.length, 1);

  useProductionGraphStore.getState().renameNode(TARGET_NODE_ID, 'Версия 2');
  useProductionGraphStore.getState().redo();

  assert.equal(getNodeTitle(TARGET_NODE_ID), 'Версия 2');
  assert.equal(useProductionGraphStore.getState().historyFuture.length, 0);
});
