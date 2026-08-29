import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  createPipelineContractField,
  PIPELINE_CONTRACT_MAX_FIELDS,
} from '@/entities/production-graph/model/types';
import {
  addPipelineContractChild,
  countPipelineContractFields,
  createUniquePipelineContractField,
  removePipelineContractField,
  updatePipelineContractField,
} from './pipeline-contract-field-tree.ts';

test('field edits preserve the stable field id', () => {
  const field = createPipelineContractField(0, { key: 'brief' });
  const fields = updatePipelineContractField([field], field.id, (current) => ({
    ...current,
    key: 'content_brief',
  }));

  assert.equal(fields[0]?.id, field.id);
  assert.equal(fields[0]?.key, 'content_brief');
});

test('nested JSON fields are added and removed without changing the parent identity', () => {
  const parent = createPipelineContractField(0, { key: 'metadata', kind: 'json' });
  const withChild = addPipelineContractChild([parent], parent.id);
  const child = withChild[0]?.fields?.[0];

  assert.ok(child);
  assert.equal(withChild[0]?.id, parent.id);
  assert.equal(countPipelineContractFields(withChild), 2);

  const withoutChild = removePipelineContractField(withChild, child.id);
  assert.equal(withoutChild[0]?.id, parent.id);
  assert.deepEqual(withoutChild[0]?.fields, []);
});

test('new field keys stay unique among siblings', () => {
  const siblings = [
    createPipelineContractField(0, { key: 'field_3' }),
    createPipelineContractField(1, { key: 'field_4' }),
  ];

  assert.equal(createUniquePipelineContractField(siblings, 'field_3').key, 'field_5');
});

test('nested fields stop at the global P0 field limit', () => {
  const fields = Array.from({ length: PIPELINE_CONTRACT_MAX_FIELDS }, (_, index) => (
    createPipelineContractField(index, { key: `value_${index + 1}`, kind: index === 0 ? 'json' : 'text' })
  ));

  const nextFields = addPipelineContractChild(fields, fields[0]!.id);
  assert.equal(nextFields, fields);
  assert.equal(countPipelineContractFields(nextFields), PIPELINE_CONTRACT_MAX_FIELDS);
});
