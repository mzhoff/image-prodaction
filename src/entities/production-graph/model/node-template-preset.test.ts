import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import {
  createNodeFromTemplateSnapshot,
  createNodeTemplateSnapshot,
  nodeTemplateSnapshotsEqual,
} from './node-template-preset';

test('node template uses the safe saved-node snapshot contract', () => {
  const node = createDefaultNode('textGeneration', { x: 100, y: 200 });
  const snapshot = createNodeTemplateSnapshot({
    ...node,
    data: {
      ...node.data,
      apiKey: 'never persist this',
      instruction: 'Keep this system instruction',
      result: 'Keep this generated output',
      title: 'Renamed generator',
    } as unknown as typeof node.data,
  });

  assert.equal(snapshot.data.title, 'Renamed generator');
  const data = snapshot.data as unknown as Record<string, unknown>;
  assert.equal(data.instruction, 'Keep this system instruction');
  assert.equal(data.result, 'Keep this generated output');
  assert.equal(data.apiKey, undefined);
  assert.equal(nodeTemplateSnapshotsEqual(snapshot, createNodeTemplateSnapshot(node)), false);

  const restored = createNodeFromTemplateSnapshot(snapshot, { x: 10, y: 20 });
  assert.notEqual(restored.id, node.id);
  assert.equal(restored.data.title, 'Renamed generator');
  assert.equal(restored.status, 'idle');
  assert.equal(restored.locked, false);
});
