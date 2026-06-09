import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExecutionLevels } from './workflow-contract.ts';

interface TestNode {
  id: string;
}

test('buildExecutionLevels returns ordered topological execution levels', () => {
  const nodes: TestNode[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const edges = [
    { id: 'e1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
    { id: 'e2', sourceNodeId: 'b', sourcePortId: 'out', targetNodeId: 'c', targetPortId: 'in' },
    { id: 'e3', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'c', targetPortId: 'in2' },
    { id: 'e4', sourceNodeId: 'c', sourcePortId: 'out', targetNodeId: 'd', targetPortId: 'in' },
  ];

  const levels = buildExecutionLevels(nodes, edges);

  assert.equal(levels.find((entry) => entry.nodeId === 'a')?.level, 0);
  assert.equal(levels.find((entry) => entry.nodeId === 'b')?.level, 1);
  assert.equal(levels.find((entry) => entry.nodeId === 'c')?.level, 2);
  assert.equal(levels.find((entry) => entry.nodeId === 'd')?.level, 3);
});

test('buildExecutionLevels supports disconnected components in same start level', () => {
  const nodes: TestNode[] = [{ id: 'input' }, { id: 'draft' }, { id: 'sink' }];
  const edges = [{ id: 'x', sourceNodeId: 'input', sourcePortId: 'out', targetNodeId: 'sink', targetPortId: 'in' }];

  const levels = buildExecutionLevels(nodes, edges);
  const map = new Map(levels.map((entry) => [entry.nodeId, entry.level]));

  assert.equal(map.get('input'), 0);
  assert.equal(map.get('draft'), 0);
  assert.equal(map.get('sink'), 1);
});

test('buildExecutionLevels throws for cycle graphs', () => {
  const nodes: TestNode[] = [{ id: 'a' }, { id: 'b' }];
  const edges = [
    { id: 'x', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
    { id: 'y', sourceNodeId: 'b', sourcePortId: 'out', targetNodeId: 'a', targetPortId: 'in' },
  ];

  assert.throws(() => buildExecutionLevels(nodes, edges));
});
