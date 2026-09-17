import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { initialProject } from './initial-project';
import { createEmptyProjectUiState } from './project-schema';
import { normalizeProject } from './normalize-project';
import { createGraphTextFragmentActions } from './graph-text-fragment-actions';
import { createGraphHistoryActions } from './graph-history-actions';
import { appendTextFragment, fragmentFieldValue, textFragmentSections, type TextFragmentSource } from './text-fragments';
import type { ProductionGraphState } from './store-types';
import type { StoreSet } from './store-action-types';
import type { ProductionNode, TextPromptNodeData } from './types';
import { sanitizePipelineNodeSettings } from '@/modules/chat-assistant/core/pipeline-node-settings';
import { createTelegramEditorValueFromSegments } from '@/modules/telegram-formatting/core';
import type { TextFormatterNodeData } from './types';

const prompt = (text: string, bubble = false) => {
  const node = createDefaultNode('textPrompt', { x: 0, y: 0 });
  node.data = { ...node.data, text, presentation: bubble ? 'bubble' : 'card' } as TextPromptNodeData;
  return node;
};
function store(nodes: ProductionNode[]) {
  let state = { ...structuredClone(initialProject), nodes, edges: [], historyPast: [], historyFuture: [], uiState: createEmptyProjectUiState() } as unknown as ProductionGraphState;
  const set: StoreSet = (update) => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
  return { get: () => state, ...createGraphTextFragmentActions(set), ...createGraphHistoryActions(set, () => state) };
}
const source = (node: ProductionNode): TextFragmentSource => ({ nodeId: node.id, field: 'text', expectedValue: fragmentFieldValue(node, 'text')!, start: 0, end: fragmentFieldValue(node, 'text')!.length });

test('identical full labels collapse in target-first order; equal-length different labels do not', () => {
  assert.equal(appendTextFragment('[ACTORS]\nПервый\n\n[STYLE]\nСтиль', '[ACTORS]\nВторой\n\n[LIGHT]\nСвет'), '[ACTORS]\nПервый\n\nВторой\n\n[STYLE]\nСтиль\n\n[LIGHT]\nСвет');
  assert.equal(appendTextFragment('[ACTORS]\nOne', '[actors]\nTwo'), '[ACTORS]\nOne\n\nTwo');
  assert.equal(appendTextFragment('First', 'Second'), 'First\n\nSecond');
  assert.equal(appendTextFragment('[ACTORS]\nA\n[ACTORS]\nB', '[ACTORS]\nC'), '[ACTORS]\nA\n\nB\n\nC');
});
test('raw section ranges include header and body without losing following sections', () => {
  const value = '[ACTORS]\r\n  A\r\n\r\n[STYLE]\r\nB';
  const section = textFragmentSections(value)[0];
  assert.equal(value.slice(section.start, section.end), '[ACTORS]\r\n  A\r\n\r\n');
});
test('move creates a persisted ordinary Prompt and undo/redo restores both sides atomically', () => {
  const node = prompt('Before fragment after'); const graph = store([node]);
  assert.deepEqual(graph.dropTextFragment({ ...source(node), start: 7, end: 15 }, { position: { x: 350, y: 150 } }, false), { ok: true });
  assert.equal(fragmentFieldValue(graph.get().nodes[0], 'text'), 'Before  after');
  assert.equal(fragmentFieldValue(graph.get().nodes[1], 'text'), 'fragment');
  assert.equal(graph.get().historyPast.length, 1);
  const restored = normalizeProject(JSON.parse(JSON.stringify(graph.get())));
  assert.equal((restored.nodes[1].data as TextPromptNodeData).presentation, 'card');
  graph.undo(); assert.deepEqual(graph.get().nodes, [node]);
  graph.redo(); assert.equal(graph.get().nodes.length, 2);
});
test('Alt copy and read-only source never remove original; invalid target and stale source are no-ops', () => {
  const from = prompt('Original'); const to = prompt('Target'); const graph = store([from, to]);
  graph.dropTextFragment(source(from), { nodeId: to.id, field: 'text' }, true);
  assert.equal(fragmentFieldValue(graph.get().nodes[0], 'text'), 'Original');
  assert.equal(fragmentFieldValue(graph.get().nodes[1], 'text'), 'Target\n\nOriginal');
  const before = graph.get().nodes;
  assert.equal(graph.dropTextFragment({ ...source(from), expectedValue: 'Outdated' }, { position: { x: 0, y: 0 } }, false).ok, false);
  assert.equal(graph.dropTextFragment(source(from), { nodeId: to.id, field: 'model' }, false).ok, false);
  assert.equal(graph.get().nodes, before);
  graph.dropTextFragment({ ...source(from), copyOnly: true }, { position: { x: 0, y: 0 } }, false);
  assert.equal(fragmentFieldValue(graph.get().nodes[0], 'text'), 'Original');
});
test('whole Prompt transfer removes the empty source and its connections in one history entry', () => {
  const from = prompt('[ACTORS]\nB', true); const to = prompt('[ACTORS]\nA', true); const graph = store([from, to]);
  graph.get().edges.push({ id: 'source-edge', sourceNodeId: from.id, sourcePortId: 'text', targetNodeId: to.id, targetPortId: 'variable-0' });
  graph.dropTextFragment({ ...source(from), disabledLabels: ['ACTORS'] }, { nodeId: to.id, field: 'text' }, false);
  assert.equal(graph.get().nodes.length, 1);
  assert.equal(graph.get().nodes[0].id, to.id);
  assert.equal(fragmentFieldValue(graph.get().nodes[0], 'text'), '[ACTORS]\nA\n\nB');
  assert.deepEqual((graph.get().nodes[0].data as TextPromptNodeData).disabledResultFilterIds, ['actors']);
  assert.deepEqual(graph.get().edges, []);
  assert.equal(graph.get().historyPast.length, 1);
  graph.undo(); assert.deepEqual(graph.get().nodes, [from, to]);
  assert.equal(graph.get().edges.length, 1);
});
test('a partial fragment transfer preserves existing nodes, their positions and all connections', () => {
  const from = prompt('AA', true); const to = prompt('B'); const graph = store([from, to]);
  graph.get().edges.push({ id: 'edge', sourceNodeId: from.id, sourcePortId: 'text', targetNodeId: to.id, targetPortId: 'variable-0' });
  const edges = graph.get().edges;
  assert.equal(graph.dropTextFragment({ ...source(from), end: 1 }, { nodeId: to.id, field: 'text' }, false).ok, true);
  assert.equal(fragmentFieldValue(graph.get().nodes[0], 'text'), 'A');
  assert.equal(fragmentFieldValue(graph.get().nodes[1], 'text'), 'B\n\nA');
  assert.deepEqual(graph.get().nodes[0].position, from.position);
  assert.equal(graph.get().edges, edges);
  graph.undo(); assert.deepEqual(graph.get().nodes, [from, to]);
  graph.dropTextFragment(source(from), { position: { x: 20, y: 30 } }, false);
  assert.equal(graph.get().nodes.length, 3);
  assert.deepEqual(graph.get().nodes[2].position, { x: 20, y: 30 });
  assert.deepEqual(graph.get().edges, edges);
});
test('bound variables stay attached and locked targets cannot be changed', () => {
  const from = prompt('@Brief'); (from.data as TextPromptNodeData).variables = [{ id: 'variable-0', alias: 'Brief' }];
  const graph = store([from]);
  assert.equal(graph.dropTextFragment(source(from), { position: { x: 0, y: 0 } }, false).ok, false);
  const locked = prompt('Locked'); locked.locked = true;
  const other = prompt('Other'); const lockedGraph = store([locked, other]);
  assert.equal(lockedGraph.dropTextFragment(source(other), { nodeId: locked.id, field: 'text' }, false).ok, false);
  lockedGraph.dropTextFragment(source(locked), { position: { x: 0, y: 0 } }, false);
  assert.equal(fragmentFieldValue(lockedGraph.get().nodes[0], 'text'), 'Locked');
});
test('agent presentation setting is validated and does not invent a new node type', () => {
  assert.deepEqual(sanitizePipelineNodeSettings('textPrompt', { presentation: 'bubble', text: 'A' }), { presentation: 'card', text: 'A' });
});

test('cutting the entire active Text Gen result keeps older versions and the empty active version', () => {
  const node = createDefaultNode('textGeneration', { x: 0, y: 0 });
  node.data = { ...node.data, result: 'Current', resultTexts: ['Earlier', 'Current'], activeResultIndex: 1 };
  const graph = store([node]);
  graph.dropTextFragment({ nodeId: node.id, field: 'result', expectedValue: 'Current', start: 0, end: 7 }, { position: { x: 0, y: 0 } }, false);
  assert.equal(fragmentFieldValue(graph.get().nodes[0], 'result'), '');
  assert.deepEqual((graph.get().nodes[0].data as { resultTexts: string[] }).resultTexts, ['Earlier', '']);
  graph.undo(); assert.equal(fragmentFieldValue(graph.get().nodes[0], 'result'), 'Current');
});

test('only transferred muted sections affect the target, including case-normalized matches', () => {
  const from = prompt('[actors]\nB\n[STYLE]\nMuted elsewhere'); const to = prompt('[ACTORS]\nA\n[STYLE]\nEnabled'); const graph = store([from, to]);
  graph.dropTextFragment({ ...source(from), end: textFragmentSections(fragmentFieldValue(from, 'text')!)[0].end, disabledLabels: ['actors', 'STYLE'] }, { nodeId: to.id, field: 'text' }, true);
  assert.deepEqual((graph.get().nodes[1].data as TextPromptNodeData).disabledResultFilterIds, ['actors']);
  assert.equal(fragmentFieldValue(graph.get().nodes[1], 'text'), '[ACTORS]\nA\n\nB\n\n[STYLE]\nEnabled');
});

test('legacy bubbles normalize to cards without changing identity or content', () => {
  const node = prompt('[CAMERA]\nClose-up', true);
  const restored = normalizeProject(JSON.parse(JSON.stringify(store([node]).get())));
  assert.equal(restored.nodes[0].id, node.id);
  assert.equal((restored.nodes[0].data as TextPromptNodeData).presentation, 'card');
  assert.equal(fragmentFieldValue(restored.nodes[0], 'text'), '[CAMERA]\nClose-up');
});

test('text input field allowlist includes real editor fields, never generated results or arbitrary settings', () => {
  const cases = { textConcat: 'suffix', subjectBuilder: 'identitySummary', locationBuilder: 'description', textFormatter: 'plainText', generateImage: 'prompt', refineImage: 'instruction' } as const;
  for (const [type, field] of Object.entries(cases)) {
    const node = createDefaultNode(type as ProductionNode['type'], { x: 0, y: 0 });
    assert.equal(typeof fragmentFieldValue(node, field), 'string');
    assert.equal(fragmentFieldValue(node, 'model'), undefined);
    if (type !== 'textFormatter') assert.equal(fragmentFieldValue(node, 'plainText'), undefined);
  }
  assert.equal(fragmentFieldValue(createDefaultNode('textConcat', { x: 0, y: 0 }), 'result'), undefined);
});

test('Formatter preserves existing formatting, appends literal new text and copies out without cutting rich text', () => {
  const formatted = createDefaultNode('textFormatter', { x: 0, y: 0 });
  const rich = createTelegramEditorValueFromSegments('Bold original', [{ text: 'Bold original', formats: ['bold'] }]);
  formatted.data = { ...formatted.data, ...rich, result: rich.plainText } as TextFormatterNodeData;
  const from = prompt('[CAMERA]\n**literal** @name');
  const graph = store([formatted, from]);
  graph.dropTextFragment(source(from), { nodeId: formatted.id, field: 'plainText' }, false);
  const data = graph.get().nodes[0].data as TextFormatterNodeData;
  assert.equal(data.plainText, 'Bold original\n\n[CAMERA]\n**literal** @name');
  assert.deepEqual(JSON.parse(data.richText!).root.children[0], JSON.parse(rich.richText).root.children[0]);
  assert.equal(data.result, data.plainText);
  const before = graph.get().nodes[0].data;
  graph.dropTextFragment({ nodeId: formatted.id, field: 'plainText', expectedValue: data.plainText!, start: 0, end: data.plainText!.length }, { position: { x: 400, y: 0 } }, false);
  assert.deepEqual(graph.get().nodes[0].data, before);
  graph.undo(); graph.undo(); assert.deepEqual(graph.get().nodes, [formatted, from]);
});
