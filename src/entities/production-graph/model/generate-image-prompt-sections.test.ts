import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { getNodePorts } from './node-definitions';
import { getGeneratePromptSectionPortId, routeGeneratePromptText } from './generate-image-prompt-sections';
import { getGeneratePromptRoute, syncGeneratePromptSections } from './sync-generate-prompt-sections';
import { useProductionGraphStore as store } from './use-production-graph-store';
import { normalizeProject } from './normalize-project';
import { initialProject } from './initial-project';
import type { GenerateImageNodeData, GraphEdge, ProductionNode } from './types';

function fixture() {
  const source = { ...createDefaultNode('textPrompt', { x: 0, y: 0 }), id: 'source' };
  source.data = { ...source.data, text: 'Intro\n[Actors]\nAlice\n[Свободный тег]\nBlue\n[Actors]\nBob' };
  const target = { ...createDefaultNode('generateImage', { x: 400, y: 0 }), id: 'target' };
  const edge = { id: 'prompt-link', sourceNodeId: source.id, sourcePortId: 'text', targetNodeId: target.id, targetPortId: 'prompt' };
  return { source, target, edge };
}
function routed(nodes: ProductionNode[], edges: GraphEdge[]) {
  const target = nodes.find((node) => node.id === 'target')!;
  return edges.filter((edge) => edge.targetNodeId === target.id).map((edge) => {
    const source = nodes.find((node) => node.id === edge.sourceNodeId)!;
    const text = (source.data as { text: string }).text;
    return routeGeneratePromptText(text, getGeneratePromptRoute(edge, target, edges));
  }).join('\n\n');
}

test('plain input creates no sections; free and duplicate tags create stable connected text ports without duplicating content', () => {
  const { source, target, edge } = fixture();
  assert.deepEqual((target.data as GenerateImageNodeData).promptSections ?? [], []);
  const plain = syncGeneratePromptSections([{ ...source, data: { ...source.data, text: 'Plain text' } }, target], [edge]);
  assert.equal(plain.edges.length, 1);
  const state = syncGeneratePromptSections([source, target], [edge]);
  assert.equal(state.edges.length, 2);
  assert.ok(state.edges.every((edge) => edge.targetPortId !== 'prompt'));
  assert.deepEqual((state.nodes[1].data as GenerateImageNodeData).promptSections?.map((entry) => entry.label), ['Actors', 'Свободный тег']);
  assert.equal(getNodePorts(state.nodes[1]).find((port) => port.id === getGeneratePromptSectionPortId('Actors'))?.kind, 'text');
  assert.ok(state.edges.every((item) => item.sourceNodeId === source.id && item.promptSourceEdgeId === edge.id));
  const prompt = routed(state.nodes, state.edges);
  for (const part of ['Alice', 'Bob', 'Blue']) assert.equal(prompt.split(part).length - 1, 1);
  const again = syncGeneratePromptSections(state.nodes, state.edges);
  assert.equal(again.nodes, state.nodes); assert.equal(again.edges, state.edges);
});

test('connect, text edits, section disconnect, undo/redo, reload and parent removal synchronize the whole graph', () => {
  const { source, target } = fixture();
  store.setState({ ...structuredClone(initialProject), nodes: [source, target], edges: [], historyPast: [], historyFuture: [] });
  const actions = store.getState();
  assert.equal(actions.connect(source.id, 'text', target.id, 'prompt').ok, true);
  assert.equal(store.getState().edges.length, 2);
  actions.updateNodeData(source.id, { text: 'Intro\n[Camera]\nWide\n[New label]\nCustom' });
  assert.deepEqual((store.getState().nodes[1].data as GenerateImageNodeData).promptSections?.map((entry) => entry.label), ['Camera', 'New label']);
  actions.undo();
  assert.ok(store.getState().edges.some((edge) => edge.targetPortId === getGeneratePromptSectionPortId('Actors')));
  actions.redo();
  const camera = store.getState().edges.find((edge) => edge.targetPortId === getGeneratePromptSectionPortId('Camera'))!;
  actions.deleteEdge(camera.id);
  assert.equal(store.getState().edges.length, 1);
  assert.ok(!routed(store.getState().nodes, store.getState().edges).includes('Wide'));
  const snapshot = JSON.parse(JSON.stringify(store.getState()));
  const normalized = normalizeProject(snapshot);
  assert.deepEqual(normalized.edges, store.getState().edges);
  actions.selectNode(source.id);
  actions.deleteSelected();
  assert.equal(store.getState().edges.length, 0);
  assert.deepEqual((store.getState().nodes.find((node) => node.id === target.id)!.data as GenerateImageNodeData).promptSections, []);
});

test('manual replacement supplies one section; two prompt sources retain distinct blocks; filters remove managed connections', () => {
  const { source, target, edge } = fixture();
  const other = { ...source, id: 'other', data: { ...source.data, text: '[Actors]\nCarol' } };
  const second = { ...edge, id: 'second', sourceNodeId: other.id };
  const state = syncGeneratePromptSections([source, target, other], [edge, second]);
  assert.equal(state.edges.filter((item) => item.targetPortId === getGeneratePromptSectionPortId('Actors')).length, 2);
  assert.equal(routed(state.nodes, state.edges).split('Carol').length - 1, 1);
  const manual = { ...second, id: 'manual', targetPortId: getGeneratePromptSectionPortId('Actors') };
  const replacement = syncGeneratePromptSections([source, target, other], [edge, manual]);
  assert.equal(replacement.edges.filter((item) => item.targetPortId === manual.targetPortId).length, 1);
  assert.ok(!routed(replacement.nodes, replacement.edges).includes('Alice'));
  assert.ok(routed(replacement.nodes, replacement.edges).includes('Carol'));
  const filtered = syncGeneratePromptSections([{ ...source, data: { ...source.data, text: '[Actors]\nAlice\n[Custom]\nKeep', disabledResultFilterIds: ['actors'] } }, target], [edge]);
  assert.equal(filtered.edges.length, 1);
  assert.equal(routeGeneratePromptText('New runtime text', { sectionId: 'actors', requireSection: true }), '');
});


test('bulk cuts are one undo step, never reconnect on edit/reload, and copied groups point only at copied sources', () => {
  const { source, target, edge } = fixture();
  const synced = syncGeneratePromptSections([source, target], [edge]);
  store.setState({ ...structuredClone(initialProject), ...synced, historyPast: [], historyFuture: [] });
  const actions = store.getState();
  actions.deleteEdges(synced.edges.map((item) => item.id));
  assert.equal(store.getState().edges.length, 0);
  assert.equal(store.getState().historyPast.length, 1);
  assert.equal((store.getState().nodes[1].data as GenerateImageNodeData).promptSections?.length, 2);
  assert.equal(normalizeProject(store.getState()).edges.length, 0);
  actions.undo(); assert.equal(store.getState().edges.length, 2);
  actions.redo(); assert.equal(store.getState().edges.length, 0);
  actions.undo();
  actions.pasteNodes(store.getState().nodes, store.getState().edges, { x: 900, y: 0 });
  const copyIds = store.getState().selectedNodeIds;
  const copyEdges = store.getState().edges.filter((item) => copyIds.includes(item.targetNodeId));
  assert.equal(copyEdges.length, 2);
  assert.ok(copyEdges.every((item) => copyIds.includes(item.sourceNodeId)));
  assert.equal(new Set(store.getState().edges.map((item) => item.id)).size, 4);
  actions.deleteEdges(copyEdges.map((item) => item.id));
  assert.equal(store.getState().edges.length, 2);
  actions.updateNodeData(source.id, { text: '[Actors]\nChanged\n[Свободный тег]\nBlue' });
  assert.equal(store.getState().edges.length, 2);
});


test('cutting a manual section replacement does not revive its automatic source; single-node duplication has no incoming links', () => {
  const { source, target, edge } = fixture();
  const synced = syncGeneratePromptSections([source, target], [edge]);
  const manualSource = { ...source, id: 'manual-source', data: { ...source.data, text: 'Manual actor' } };
  const manual = { ...edge, id: 'manual', sourceNodeId: manualSource.id, targetPortId: getGeneratePromptSectionPortId('Actors') };
  const replaced = syncGeneratePromptSections([...synced.nodes, manualSource], [...synced.edges, manual]);
  store.setState({ ...structuredClone(initialProject), ...replaced, historyPast: [], historyFuture: [] });
  const actions = store.getState();
  actions.deleteEdges([manual.id]);
  assert.ok(!store.getState().edges.some((item) => item.targetPortId === manual.targetPortId));
  actions.undo();
  assert.equal(store.getState().edges.find((item) => item.targetPortId === manual.targetPortId)?.sourceNodeId, manualSource.id);
  actions.duplicateNode(target.id);
  const duplicate = store.getState().selectedNodeIds[0];
  assert.ok(!store.getState().edges.some((item) => item.targetNodeId === duplicate));
});
