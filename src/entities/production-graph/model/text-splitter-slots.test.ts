import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { getIncomingTextInputs, getNodeTextResult, getNodeTextResults } from './graph-io';
import { getNodePorts } from './node-definitions';
import { normalizeTextNode } from './normalize-project-text-nodes';
import { productionLayers } from './production-layers';
import { splitProductionText } from './text-splitter';
import { getTextSplitterItemKeys, reconcileTextSplitterSlots } from './text-splitter-slots';
import type { GraphEdge, TextSplitterNodeData } from './types';

const sections = productionLayers.map((layer) => `[${layer.label.toUpperCase()}]\n${layer.id} description`);
const fullText = sections.join('\n\n');
const split = (text: string) => splitProductionText(text, 'delimiter', '[');
const originalItems = split(fullText);

test('Extract -> Splitter -> Generate Image preserves every layer when any badge is disabled', () => {
  for (const disabled of productionLayers) {
    const extract = createDefaultNode('imageToText', { x: 0, y: 0 });
    Object.assign(extract.data, { result: fullText, disabledLayerIds: [disabled.id] });
    const splitter = createDefaultNode('textSplitter', { x: 400, y: 0 });
    const generator = createDefaultNode('generateImage', { x: 800, y: 0 });
    const edges: GraphEdge[] = productionLayers.map((layer, index) => ({
      id: `wire-${layer.id}`, sourceNodeId: splitter.id, sourcePortId: `item-${index}`,
      targetNodeId: generator.id, targetPortId: layer.id,
    }));
    const before = JSON.stringify(edges);
    // Legacy saved items seed identities before the first live recomputation.
    const slots = reconcileTextSplitterSlots(split(getNodeTextResult(extract)), { items: originalItems });
    Object.assign(splitter.data, slots);
    const context = { edges, nodes: [extract, splitter, generator] };
    for (const [index, layer] of productionLayers.entries()) {
      const inputs = getIncomingTextInputs(generator.id, layer.id, context);
      assert.deepEqual(inputs.map((input) => input.text), layer.id === disabled.id ? [] : [originalItems[index]]);
    }
    assert.equal(getNodePorts(splitter).filter((port) => port.id.startsWith('item-')).length, 10);
    assert.equal(getNodeTextResults(splitter, 'items').length, 9);
    assert.equal(JSON.stringify(edges), before);
    const restored = reconcileTextSplitterSlots(originalItems, slots);
    assert.deepEqual(restored.items, originalItems);
    assert.deepEqual(restored.itemKeys, slots.itemKeys);
  }
});

test('empty input, JSON reload and normalization preserve tombstones and restoration', () => {
  const initial = reconcileTextSplitterSlots(originalItems, {});
  const empty = reconcileTextSplitterSlots([], initial);
  assert.deepEqual(empty.items, originalItems.map(() => ''));
  const node = createDefaultNode('textSplitter', { x: 0, y: 0 });
  Object.assign(node.data, empty);
  const loaded = normalizeTextNode(JSON.parse(JSON.stringify(node)))!;
  assert.deepEqual(reconcileTextSplitterSlots(originalItems, loaded.data as TextSplitterNodeData).items, originalItems);
});

test('named sections may reorder, update descriptions or aliases without changing slots', () => {
  const initial = reconcileTextSplitterSlots(originalItems, {});
  const changed = split('[COLOR / GRADE]\nnew palette\n\n[Lighting]\nnew light\n\n[Actors]\nnew actor');
  const result = reconcileTextSplitterSlots(changed, initial);
  assert.equal(result.items[0], 'Actors]\nnew actor');
  assert.equal(result.items[6], 'Lighting]\nnew light');
  assert.equal(result.items[7], 'COLOR / GRADE]\nnew palette');
  assert.equal(result.items[4], '');
  assert.deepEqual(result.itemKeys, initial.itemKeys);
});

test('arbitrary Prompt headers and paragraphs have stable identities too', () => {
  const initial = reconcileTextSplitterSlots(['[БРЕНД]\nА', '[АУДИТОРИЯ]\nБ'], {});
  const filtered = reconcileTextSplitterSlots(['[АУДИТОРИЯ]\nновое'], initial);
  assert.deepEqual(filtered.items, ['', '[АУДИТОРИЯ]\nновое']);
});

test('duplicate headers fail closed instead of shifting one description into another wire', () => {
  const initial = reconcileTextSplitterSlots(['LIGHT]\nfirst', 'LIGHT]\nsecond', 'STYLE]\nstyle'], {});
  const next = reconcileTextSplitterSlots(['LIGHT]\nsecond', 'STYLE]\nstyle'], initial);
  assert.deepEqual(next.items, ['', 'LIGHT]\nsecond', 'STYLE]\nstyle']);
  const ambiguous = reconcileTextSplitterSlots(['LIGHT]\nchanged'], next);
  assert.equal(ambiguous.items[0], '');
  assert.equal(ambiguous.items[1], '');
});

test('30 reserved slots never get reassigned to newly arriving sections', () => {
  const fragments = Array.from({ length: 30 }, (_, index) => `[SECTION ${index}]\ntext`);
  const initial = reconcileTextSplitterSlots(fragments, {});
  const reserved = fragments.map((_, index) => index);
  const full = reconcileTextSplitterSlots(['[NEW]\nnew'], initial, reserved);
  assert.equal(full.overflowCount, 1);
  assert.deepEqual(full.itemKeys, initial.itemKeys);
  assert.ok(full.items.every((item) => item === ''));
  const free = reconcileTextSplitterSlots(['[NEW]\nnew'], initial, reserved.slice(1));
  assert.equal(free.overflowCount, 0);
  assert.equal(free.items[0], '[NEW]\nnew');
});

test('ordinary delimiter lists retain positional behavior and their 30-item limit', () => {
  const initial = reconcileTextSplitterSlots(['First', 'Second'], {});
  assert.deepEqual(initial.itemKeys, []);
  assert.deepEqual(reconcileTextSplitterSlots(['Changed'], initial).items, ['Changed']);
  assert.equal(reconcileTextSplitterSlots(Array.from({ length: 31 }, (_, index) => `${index}`), {}).overflowCount, 1);
  assert.deepEqual(getTextSplitterItemKeys({ items: originalItems }).slice(6, 8), ['section:light', 'section:color']);
});
