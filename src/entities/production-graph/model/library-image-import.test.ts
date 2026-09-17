import assert from 'node:assert/strict';
import test from 'node:test';
import { createGraphNodeActions } from './graph-node-actions';
import { createGraphHistoryActions } from './graph-history-actions';
import { initialProject } from './initial-project';
import { createEmptyProjectUiState } from './project-schema';
import { createDefaultNode } from './create-default-node';
import type { ProductionGraphState } from './store-types';
import type { StoreSet } from './store-action-types';
import { mapRemoteImageAsset } from '../lib/remote-asset';
import { NODE_HELP_METADATA } from './node-help';

test('Library insertion preserves graph, reuses asset, deduplicates delivery and is undoable', () => {
  const old = createDefaultNode('textPrompt', { x: 42, y: 57 });
  let state = { ...structuredClone(initialProject), nodes: [old], edges: [], assets: [], historyPast: [], historyFuture: [], uiState: createEmptyProjectUiState() } as unknown as ProductionGraphState;
  const set: StoreSet = (update) => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
  const actions = createGraphNodeActions(set);
  const history = createGraphHistoryActions(set, () => state);
  const asset = mapRemoteImageAsset({ id: 'asset', originalName: 'image.png', contentType: 'image/png', width: 1600, height: 900, createdAt: '2026-09-08' });
  actions.pasteImageAsset(asset, { x: 500, y: 300 }, undefined, 'library-import-test');
  assert.equal(state.nodes[0], old);
  assert.equal(state.nodes[1].type, 'importImage');
  assert.equal('assetId' in state.nodes[1].data ? state.nodes[1].data.assetId : null, asset.id);
  assert.equal(state.historyPast.length, 1);
  actions.pasteImageAsset(asset, { x: 0, y: 0 }, undefined, 'library-import-test');
  assert.equal(state.nodes.length, 2);
  assert.equal(state.historyPast.length, 1);
  history.undo(); assert.deepEqual(state.nodes, [old]);
  history.redo(); assert.equal(state.nodes.length, 2);
  actions.pasteImageAsset(asset, { x: 800, y: 300 });
  assert.equal(state.assets.length, 1);
  assert.equal(state.nodes.length, 3);
});
test('live Ask AI and node catalog explain Library reuse without inventing ports', () => {
  assert.match(JSON.stringify(NODE_HELP_METADATA.importImage), /Отправить в проект/);
  assert.match(JSON.stringify(NODE_HELP_METADATA.importImage), /не новый входной порт/);
  assert.match(JSON.stringify(NODE_HELP_METADATA.importImage), /до 100.*одной отменой Undo/);
  assert.match(JSON.stringify(NODE_HELP_METADATA.importImage), /Для группы копирование ссылки недоступно/);
});
