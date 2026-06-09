import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphEdge, ProductionNode } from './types';
import {
  compactDynamicInputSlotEdges,
  compactDynamicInputNodeState,
  compactDynamicInputsForNodes,
  getDynamicInputPortIndex,
  getDynamicInputSlotSpec,
  updateDynamicInputCount,
} from './dynamic-input-slot.ts';

const baseTextConcatNode = {
  id: 'node-1',
  type: 'textConcat',
  position: { x: 0, y: 0 },
  size: { width: 1, height: 1 },
  status: 'idle',
  data: {
    title: 'concat',
    inputCount: 3,
    customSeparator: '',
    prefix: '',
    suffix: '',
    separator: 'newline',
  },
} satisfies ProductionNode;

const baseTelegramNode = {
  id: 'node-2',
  type: 'telegramPublication',
  position: { x: 0, y: 0 },
  size: { width: 1, height: 1 },
  status: 'idle',
  data: {
    title: 'telegram',
    contentUnitId: 'telegram-post',
    platformId: 'instagram',
    mediaInputCount: 2,
    messageText: '',
    mediaOrder: [],
  },
} satisfies ProductionNode;

const baseExportNode = {
  id: 'node-3',
  type: 'exportImage',
  position: { x: 0, y: 0 },
  size: { width: 1, height: 1 },
  status: 'idle',
  data: {
    title: 'export',
    imageInputCount: 2,
    format: 'png',
    quality: '90',
    scale: '1',
    background: 'transparent',
  },
} satisfies ProductionNode;

test('getDynamicInputSlotSpec resolves text concat and telegram publication specs', () => {
  assert.ok(getDynamicInputSlotSpec('textConcat'));
  assert.ok(getDynamicInputSlotSpec('telegramPublication'));
  assert.ok(getDynamicInputSlotSpec('exportImage'));
  assert.equal(getDynamicInputSlotSpec('textPrompt'), undefined);
});

test('getDynamicInputPortIndex parses known node port ids', () => {
  assert.equal(getDynamicInputPortIndex('textConcat', 'text-0'), 0);
  assert.equal(getDynamicInputPortIndex('textConcat', 'text-12'), 12);
  assert.equal(getDynamicInputPortIndex('textConcat', 'media-0'), -1);
  assert.equal(getDynamicInputPortIndex('telegramPublication', 'media-3'), 3);
  assert.equal(getDynamicInputPortIndex('exportImage', 'image-3'), 3);
  assert.equal(getDynamicInputPortIndex('exportImage', 'text-3'), -1);
});

test('compactDynamicInputSlotEdges closes gaps without touching unrelated edges', () => {
  const edges: GraphEdge[] = [
    {
      id: 'a',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: baseTextConcatNode.id,
      targetPortId: 'text-3',
    },
    {
      id: 'b',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: baseTextConcatNode.id,
      targetPortId: 'text-7',
    },
    {
      id: 'c',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: 'other-node',
      targetPortId: 'text-99',
    },
  ];

  const nextEdges = compactDynamicInputSlotEdges(edges, baseTextConcatNode.id, 'textConcat');
  const targetPorts = new Map(nextEdges.filter((edge) => edge.targetNodeId === baseTextConcatNode.id).map((edge) => [edge.id, edge.targetPortId]));

  assert.deepEqual(targetPorts.get('a'), 'text-0');
  assert.deepEqual(targetPorts.get('b'), 'text-1');
  assert.equal(nextEdges.find((edge) => edge.id === 'c')?.targetPortId, 'text-99');
});

test('compactDynamicInputSlotEdges compact export image inputs and keeps unrelated edges', () => {
  const edges: GraphEdge[] = [
    {
      id: 'e',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: baseExportNode.id,
      targetPortId: 'image-3',
    },
    {
      id: 'f',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: baseExportNode.id,
      targetPortId: 'image-7',
    },
  ];

  const nextEdges = compactDynamicInputSlotEdges(edges, baseExportNode.id, 'exportImage');
  assert.deepEqual(nextEdges.filter((edge) => edge.targetNodeId === baseExportNode.id).map((edge) => edge.targetPortId), ['image-0', 'image-1']);
});

test('compactDynamicInputSlotEdges preserves telegram media ids to keep connection identity', () => {
  const edges: GraphEdge[] = [
    {
      id: 'g',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: baseTelegramNode.id,
      targetPortId: 'media-4',
    },
    {
      id: 'h',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: baseTelegramNode.id,
      targetPortId: 'media-8',
    },
  ];

  const nextEdges = compactDynamicInputSlotEdges(edges, baseTelegramNode.id, 'telegramPublication');
  assert.deepEqual(
    nextEdges.filter((edge) => edge.targetNodeId === baseTelegramNode.id).map((edge) => edge.targetPortId),
    ['media-4', 'media-8'],
  );
});

test('compactDynamicInputNodeState normalizes counts and edge order for text concat node', () => {
  const nodes = [{
    ...baseTextConcatNode,
    data: {
      ...baseTextConcatNode.data,
      inputCount: 10,
    },
  }] as ProductionNode[];
  const edges: GraphEdge[] = [
    { id: 'a', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseTextConcatNode.id, targetPortId: 'text-3' },
    { id: 'b', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseTextConcatNode.id, targetPortId: 'text-5' },
  ];

  const { edges: nextEdges, nodes: nextNodes } = compactDynamicInputNodeState(nodes, edges, baseTextConcatNode.id);
  assert.deepEqual(nextEdges.map((edge) => edge.targetPortId), ['text-0', 'text-1']);
  const updated = nextNodes[0];
  assert.equal((updated.data as { inputCount?: number }).inputCount, 3);
});

test('compactDynamicInputsForNodes keeps node-specific values in one pass', () => {
  const nodes = [
    {
      ...baseTextConcatNode,
      data: { ...baseTextConcatNode.data, inputCount: 2 },
    },
    {
      ...baseTelegramNode,
      data: {
        ...baseTelegramNode.data,
        mediaInputCount: 2,
        mediaOrder: ['a'],
      },
    },
  ] as ProductionNode[];
  const edges: GraphEdge[] = [
    { id: 'a', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseTextConcatNode.id, targetPortId: 'text-3' },
    { id: 'b', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseTelegramNode.id, targetPortId: 'media-4' },
    { id: 'c', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseTelegramNode.id, targetPortId: 'media-8' },
  ];

  const { edges: nextEdges, nodes: nextNodes } = compactDynamicInputsForNodes(nodes, edges);
  const concat = nextNodes.find((node) => node.id === baseTextConcatNode.id);
  const telegram = nextNodes.find((node) => node.id === baseTelegramNode.id);

  assert.equal((concat?.data as { inputCount?: number }).inputCount, 2);
  assert.equal((telegram?.data as { mediaInputCount?: number }).mediaInputCount, 10);
  assert.deepEqual(nextEdges.find((edge) => edge.id === 'b')?.targetPortId, 'media-4');
  assert.deepEqual(nextEdges.find((edge) => edge.id === 'c')?.targetPortId, 'media-8');
});

test('updateDynamicInputCount is idempotent when field already matches', () => {
  const updated = updateDynamicInputCount(baseTelegramNode, [
    { id: 'a', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseTelegramNode.id, targetPortId: 'media-0' },
  ]);
  assert.equal((updated.data as { mediaInputCount?: number }).mediaInputCount, 2);
});

test('updateDynamicInputCount expands telegram media inputs to keep highest id plus free slot', () => {
  const updated = updateDynamicInputCount(baseTelegramNode, [
    { id: 'a', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseTelegramNode.id, targetPortId: 'media-4' },
    { id: 'b', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseTelegramNode.id, targetPortId: 'media-8' },
  ]);
  assert.equal((updated.data as { mediaInputCount?: number }).mediaInputCount, 10);
});

test('updateDynamicInputCount updates export image input count and keeps min size', () => {
  const updated = updateDynamicInputCount(baseExportNode, []);
  assert.equal((updated.data as { imageInputCount?: number }).imageInputCount, 1);

  const withEdges = updateDynamicInputCount(baseExportNode, [
    { id: 'a', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseExportNode.id, targetPortId: 'image-0' },
    { id: 'b', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseExportNode.id, targetPortId: 'image-1' },
    { id: 'c', sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: baseExportNode.id, targetPortId: 'image-3' },
  ]);
  assert.equal((withEdges.data as { imageInputCount?: number }).imageInputCount, 4);
});
