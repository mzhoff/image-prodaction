import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { canConnectPorts, getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import type { GraphEdge, ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { getBatchConnectionPlan, type BatchConnectionDirection } from './batch-connect-create';

const node = (type: ProductionNodeType) => createDefaultNode(type, { x: 0, y: 0 });
const options = (nodes: ProductionNode[], direction: BatchConnectionDirection) => (
  PRODUCTION_NODE_TYPES.filter((type) => getBatchConnectionPlan(nodes, type, direction))
);

test('each of 42 Imports gets its own compatible single-input Crop', () => {
  const imports = Array.from({ length: 42 }, () => node('importImage'));
  const plan = getBatchConnectionPlan(imports, 'cropImage', 'output')!;
  assert.equal(plan.length, 42);
  assert.equal(new Set(plan.map((pair) => pair.newNode.id)).size, 42);
  for (const pair of plan) {
    assert.ok(canConnectPorts(pair.selectedNode, pair.sourcePortId, pair.newNode, pair.targetPortId));
  }
  assert.deepEqual(options(imports, 'output'), options([imports[0]], 'output'));
});

test('mixed selections use the exact intersection of independent compatible node types in either direction', () => {
  const nodes = [node('importImage'), node('textPrompt'), node('imageToText'), node('audioConvert')];
  for (const direction of ['input', 'output'] as const) {
    for (const first of nodes) for (const second of nodes) {
      const expected = options([first], direction).filter((type) => options([second], direction).includes(type));
      assert.deepEqual(options([first, second], direction), expected);
    }
  }
  assert.ok(options([nodes[0], nodes[1]], 'output').includes('generateImage'));
  assert.ok(!options([nodes[0], nodes[1]], 'output').includes('cropImage'));
});

test('compatibility follows actual Import media ports, not just the node type', () => {
  const image = node('importImage');
  const audio = { ...node('importImage'), data: { ...image.data, mediaKind: 'audio' } } as ProductionNode;
  assert.equal(getBatchConnectionPlan([image, audio], 'cropImage', 'output'), undefined);
  assert.ok(getBatchConnectionPlan([audio], 'audioConvert', 'output'));
});

test('adding to input creates independent Imports and never replaces occupied connections', () => {
  const crops = [node('cropImage'), node('cropImage')];
  const plan = getBatchConnectionPlan(crops, 'importImage', 'input')!;
  assert.equal(plan.length, 2);
  assert.notEqual(plan[0].newNode.id, plan[1].newNode.id);
  const occupied = [{ id: 'edge', sourceNodeId: 'existing', sourcePortId: 'image', targetNodeId: crops[0].id, targetPortId: plan[0].targetPortId }] as GraphEdge[];
  assert.equal(getBatchConnectionPlan(crops, 'importImage', 'input', occupied), undefined);
  assert.deepEqual(options([node('importImage')], 'input'), []);
});

test('each new pipeline boundary adapts independently to its neighboring port kind', () => {
  const nodes = [node('importImage'), node('textPrompt')];
  const plan = getBatchConnectionPlan(nodes, 'pipelineOutput', 'output')!;
  assert.deepEqual(plan.map(({ newNode }) => getNodePorts(newNode)[0].kind), ['image', 'text']);
  for (const pair of plan) assert.ok(canConnectPorts(pair.selectedNode, pair.sourcePortId, pair.newNode, pair.targetPortId));
  const inputs = getBatchConnectionPlan([node('cropImage'), node('audioConvert')], 'pipelineInput', 'input')!;
  assert.deepEqual(inputs.map(({ newNode }) => getNodePorts(newNode)[0].kind), ['image', 'audio']);
});

test('no selection or a node without a relevant port produces no plan', () => {
  assert.equal(getBatchConnectionPlan([], 'cropImage', 'output'), undefined);
  assert.equal(getBatchConnectionPlan([node('banner')], 'cropImage', 'output'), undefined);
  assert.equal(getBatchConnectionPlan([node('importImage'), node('banner')], 'cropImage', 'output'), undefined);
});

test('shared Generate inputs stay connectable for text while their image-reference cap is enforced', () => {
  const generator = node('generateImage');
  const imports = Array.from({ length: 4 }, () => node('importImage'));
  const edges = imports.map((source, i) => ({ id: `edge-${i}`, sourceNodeId: source.id,
    sourcePortId: 'image', targetNodeId: generator.id, targetPortId: 'actors' }));
  const nodes = [generator, ...imports];
  assert.ok(getBatchConnectionPlan([generator], 'importImage', 'input', edges.slice(0, 3), nodes));
  assert.equal(getBatchConnectionPlan([generator], 'importImage', 'input', edges, nodes), undefined);
  const textEdges = getNodePorts(generator).filter((port) => port.side === 'input').map((port, i) => ({
    id: `text-edge-${i}`, sourceNodeId: 'text', sourcePortId: 'text', targetNodeId: generator.id, targetPortId: port.id,
  }));
  assert.ok(getBatchConnectionPlan([generator], 'textPrompt', 'input', [...edges, ...textEdges], nodes));
});
