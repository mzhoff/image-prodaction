import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProject } from './initial-project';
import { createDefaultNode } from './create-default-node';
import { createEmptyProjectUiState } from './project-schema';
import { useProductionGraphStore } from './use-production-graph-store';
import { mapRemoteImageAsset } from '../lib/remote-asset';
import { insertLibraryImageBatch } from './library-image-batch-import';

test('Library batch preserves existing nodes, lays out originals, deduplicates and undoes/redoes as one action', () => {
  const existing = createDefaultNode('textPrompt', { x: 0, y: 0 });
  useProductionGraphStore.setState({ ...structuredClone(initialProject), nodes: [existing], edges: [], assets: [],
    uiState: createEmptyProjectUiState(), historyPast: [], historyFuture: [] });
  const entries = Array.from({ length: 5 }, (_, index) => ({ nodeId: `library-test-${index}`,
    asset: mapRemoteImageAsset({ id: `asset-${index}`, originalName: 'image.png', contentType: 'image/png', width: 900, height: 1600, createdAt: '2026-09-12' }) }));
  insertLibraryImageBatch(entries, { x: 500, y: 500 });
  const state = useProductionGraphStore.getState();
  assert.equal(state.nodes[0], existing); assert.equal(state.nodes.length, 6);
  assert.equal(state.historyPast.length, 1); assert.equal(state.assets.length, 5);
  assert.ok(state.nodes[2].position.x > state.nodes[1].position.x + state.nodes[1].size.width);
  assert.ok(state.nodes[4].position.y > state.nodes[1].position.y + state.nodes[1].size.width * 1600 / 900 + 100);
  insertLibraryImageBatch(entries, { x: 0, y: 0 });
  assert.equal(useProductionGraphStore.getState().nodes.length, 6);
  assert.equal(useProductionGraphStore.getState().historyPast.length, 1);
  state.undo(); assert.deepEqual(useProductionGraphStore.getState().nodes, [existing]);
  state.redo(); assert.deepEqual(useProductionGraphStore.getState().nodes, state.nodes);
});
