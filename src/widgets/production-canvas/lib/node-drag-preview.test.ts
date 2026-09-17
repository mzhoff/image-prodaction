import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { createNodeDragPreview } from './node-drag-preview';

test('hundreds of presentation moves leave graph unchanged and touch only moving card/adjacent edge', () => {
  const source = createDefaultNode('textPrompt', { x: 0, y: 0 });
  const target = createDefaultNode('generateImage', { x: 500, y: 0 });
  const third = createDefaultNode('generateImage', { x: 1000, y: 0 });
  const nodes = [source, target, third];
  const edges = [
    { id: 'near', sourceNodeId: source.id, sourcePortId: 'text', targetNodeId: target.id, targetPortId: 'prompt' },
    { id: 'far', sourceNodeId: target.id, sourcePortId: 'image', targetNodeId: third.id, targetPortId: 'reference' },
  ];
  const original = JSON.stringify({ nodes, edges });
  const cards = nodes.map((node) => ({ dataset: { nodeId: node.id }, style: { transform: '' } }));
  const paths = edges.map((edge) => ({ dataset: { edgeId: edge.id }, writes: 0, value: 'original',
    getAttribute() { return this.value; }, setAttribute(_name: string, value: string) { this.value = value; this.writes++; } }));
  const container = { dataset: {} as Record<string, string>, dispatchEvent: () => true,
    querySelectorAll: (selector: string) => selector === '[data-edge-id]' ? paths : cards };
  const preview = createNodeDragPreview(container as unknown as HTMLElement, nodes, edges, new Set([source.id]), new Set(), {
    measuredPortPoints: {}, collapsedGenerateComposingNodeIds: new Set(),
  });
  for (let index = 1; index <= 200; index++) preview.move({ x: index, y: index / 2 });
  assert.equal(cards[0].style.transform, 'translate(200px, 100px)');
  assert.equal(cards[1].style.transform, '');
  assert.equal(paths[0].writes, 200);
  assert.equal(paths[1].writes, 0);
  assert.equal(JSON.stringify({ nodes, edges }), original);
  preview.dispose();
  assert.equal(cards[0].style.transform, '');
  assert.equal(paths[0].value, 'original');
  assert.equal(container.dataset.dragPreview, undefined);
});
