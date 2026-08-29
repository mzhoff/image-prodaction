import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node.ts';
import { getNodePorts } from './node-definitions.ts';
import {
  getPipelineFieldPortId,
  normalizePipelineContractFields,
  validatePipelineContractFields,
} from './pipeline-contract-fields.ts';

test('contract field ports remain stable when a public key changes or rows reorder', () => {
  const node = createDefaultNode('pipelineInput', { x: 0, y: 0 });
  node.data = {
    title: 'Pipeline Input',
    fields: [
      { id: 'field-topic', key: 'topic', kind: 'text', required: true },
      { id: 'field-count', key: 'count', kind: 'number', required: false },
    ],
  };
  const firstPorts = getNodePorts(node).map((port) => port.id);

  node.data = {
    ...node.data,
    fields: [
      { id: 'field-count', key: 'limit', kind: 'number', required: false },
      { id: 'field-topic', key: 'subject', kind: 'text', required: true },
    ],
  };
  const secondPorts = getNodePorts(node).map((port) => port.id);

  assert.deepEqual(new Set(firstPorts), new Set(secondPorts));
  assert.ok(secondPorts.includes(getPipelineFieldPortId('field-topic')));
  assert.ok(secondPorts.includes(getPipelineFieldPortId('field-count')));
});

test('normalization bounds recursive JSON fields and keeps supported public kinds', () => {
  const fields = normalizePipelineContractFields([
    {
      id: 'root',
      key: 'result',
      kind: 'json',
      required: true,
      fields: [{ id: 'title', key: 'title', kind: 'text', required: true }],
    },
    { id: 'flag', key: 'published', kind: 'boolean', required: false },
  ]);

  assert.equal(fields.length, 2);
  assert.equal(fields[0]?.kind, 'json');
  assert.equal(fields[0]?.fields?.[0]?.key, 'title');
  assert.equal(fields[1]?.kind, 'boolean');
});

test('validation rejects duplicate keys, invalid public names and non-JSON children', () => {
  const errors = validatePipelineContractFields([
    { id: 'one', key: 'bad key', kind: 'text', required: true, fields: [] },
    { id: 'two', key: 'duplicate', kind: 'text', required: true },
    { id: 'three', key: 'duplicate', kind: 'number', required: false },
  ]);

  assert.ok(errors.some((error) => error.includes('invalid public name')));
  assert.ok(errors.some((error) => error.includes('allowed only for a JSON object')));
  assert.ok(errors.some((error) => error.includes('unique within its object')));
});
