import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { PRODUCTION_NODE_TYPES, getNodeDefinition } from './node-registry';
import { normalizeNode } from './normalize-project-node';

test('normalizeNode preserves a renamed title for every node type', () => {
  PRODUCTION_NODE_TYPES.forEach((type) => {
    const node = createDefaultNode(type, { x: 0, y: 0 });
    const normalized = normalizeNode({
      ...node,
      data: { ...node.data, title: `  Custom ${type}  ` },
    });
    assert.equal(normalized.data.title, `Custom ${type}`, type);
  });
});

test('normalizeNode keeps the node default when a persisted title is blank', () => {
  PRODUCTION_NODE_TYPES.forEach((type) => {
    const node = createDefaultNode(type, { x: 0, y: 0 });
    const normalized = normalizeNode({
      ...node,
      data: { ...node.data, title: '   ' },
    });
    assert.equal(normalized.data.title, getNodeDefinition(type).title, type);
  });
});
