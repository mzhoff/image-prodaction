import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyProjectUiState } from './project-schema';
import { createDefaultNode } from './create-default-node';
import { createGraphHistoryActions } from './graph-history-actions';
import { withHistory } from './graph-history';
import { initialProject } from './initial-project';
import type { ProductionGraphState } from './store-types';

test('runInHistoryBatch makes multiple graph mutations undoable as one action', () => {
  let state = {
    ...structuredClone(initialProject),
    historyPast: [],
    historyFuture: [],
    uiState: createEmptyProjectUiState(),
  } as unknown as ProductionGraphState;
  const actions = createGraphHistoryActions(
    (partial) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      state = { ...state, ...next };
    },
    () => state,
  );
  const initialNodeCount = state.nodes.length;

  actions.runInHistoryBatch(() => {
    state = {
      ...state,
      ...withHistory(state),
      nodes: [...state.nodes, { ...createDefaultNode('imageToText', { x: 0, y: 0 }), id: 'first' }],
    };
    state = {
      ...state,
      ...withHistory(state),
      nodes: [...state.nodes, { ...createDefaultNode('imageToText', { x: 10, y: 10 }), id: 'second' }],
    };
  });

  assert.equal(state.nodes.length, initialNodeCount + 2);
  assert.equal(state.historyPast.length, 1);
  actions.undo();
  assert.equal(state.nodes.length, initialNodeCount);
  assert.equal(state.historyFuture.length, 1);
});
