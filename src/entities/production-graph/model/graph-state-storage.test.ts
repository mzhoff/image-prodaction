import assert from 'node:assert/strict';
import test from 'node:test';
import { createGraphStateStorage, selectPersistedGraphState } from './graph-state-storage';
import { useProductionGraphStore } from './use-production-graph-store';
import { createDefaultNode } from './create-default-node';

test('history-only updates do not serialize/write a graph; one coordinate commit writes once', () => {
  const writes: string[] = [];
  const storage = createGraphStateStorage(() => ({ getItem: () => null, removeItem: () => {}, setItem: (_, value) => { writes.push(value); } }));
  const before = useProductionGraphStore.getState();
  const first = createDefaultNode('textPrompt', { x: 10, y: 20 });
  const second = createDefaultNode('generateImage', { x: 300, y: 20 });
  const nodes = [first, second];
  const state = { ...before, nodes, sections: [] };
  storage.setItem('graph', { state: selectPersistedGraphState(state) });
  storage.setItem('graph', { state: selectPersistedGraphState({ ...state, historyPast: [...state.historyPast] }) });
  assert.equal(writes.length, 1);
  storage.setItem('graph', { state: selectPersistedGraphState({ ...state, nodes: [{ ...first, position: { x: 30, y: 20 } }, second] }) });
  assert.equal(writes.length, 2);
  assert.deepEqual(JSON.parse(writes[1]).state.nodes[0].position, { x: 30, y: 20 });
});

test('moving a node preserves graph topology, ordering, settings and all other node identities', () => {
  const before = useProductionGraphStore.getState();
  const first = createDefaultNode('textPrompt', { x: 10, y: 20 });
  const second = createDefaultNode('generateImage', { x: 300, y: 20 });
  const edges = [{ id: 'e', sourceNodeId: first.id, sourcePortId: 'text', targetNodeId: second.id, targetPortId: 'prompt' }];
  try {
    useProductionGraphStore.setState({ nodes: [first, second], edges, sections: [] });
    useProductionGraphStore.getState().selectNode(second.id);
    assert.deepEqual(useProductionGraphStore.getState().nodes.map((node) => node.id), [first.id, second.id]);
    useProductionGraphStore.getState().moveNode(first.id, { x: 80, y: 90 });
    const next = useProductionGraphStore.getState();
    assert.strictEqual(next.nodes[1], second);
    assert.strictEqual(next.nodes[0].data, first.data);
    assert.strictEqual(next.nodes[0].size, first.size);
    assert.strictEqual(next.edges, edges);
    assert.deepEqual(next.nodes[0].position, { x: 80, y: 90 });
    assert.deepEqual(next.nodes.map((node) => node.id), [first.id, second.id]);
  } finally { useProductionGraphStore.setState(before); }
});
