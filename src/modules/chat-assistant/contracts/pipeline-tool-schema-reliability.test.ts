import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import { pipelineContractFieldsSchema } from '../core/pipeline-contract-field-schema.ts';
import { pipelineUpdateInputSchema } from '../core/pipeline-update.ts';
import { createPipelineNodeSchema } from './pipeline-node-tool-schema.ts';
import { pipelineUpdateInputJsonSchema } from './pipeline-update-tool-schema.ts';

test('provider and runtime schemas preserve a bounded pipeline field defaultValue', () => {
  const validateNode = new Ajv({ allErrors: true }).compile(createPipelineNodeSchema());
  const node = {
    key: 'publicInput',
    type: 'pipelineInput',
    settings: {
      fields: [{
        id: 'target-url',
        key: 'target_url',
        kind: 'text',
        required: false,
        defaultValue: 'https://example.test/event',
      }],
    },
  };

  assert.equal(validateNode(node), true, JSON.stringify(validateNode.errors));
  const parsed = pipelineContractFieldsSchema.parse(node.settings.fields);
  assert.equal(parsed[0]?.defaultValue, 'https://example.test/event');
});

test('pipeline_update accepts build-style edge aliases and normalizes them to refs', () => {
  const validateUpdate = new Ajv({ allErrors: true }).compile(pipelineUpdateInputJsonSchema);
  const input = {
    summary: 'Add a QR result to the existing graph.',
    edges: [{
      sourceNodeKey: 'qr',
      sourcePortId: 'image',
      targetNodeKey: 'composition',
      targetPortId: 'layer-1',
    }],
  };

  assert.equal(validateUpdate(input), true, JSON.stringify(validateUpdate.errors));
  assert.deepEqual(pipelineUpdateInputSchema.parse(input).edges, [{
    sourceNodeRef: 'qr',
    sourcePortId: 'image',
    targetNodeRef: 'composition',
    targetPortId: 'layer-1',
  }]);
});

test('pipeline_update still rejects conflicting aliases instead of guessing', () => {
  const result = pipelineUpdateInputSchema.safeParse({
    summary: 'Add a QR result to the existing graph.',
    edges: [{
      sourceNodeRef: 'qr-existing',
      sourceNodeKey: 'qr-new',
      sourcePortId: 'image',
      targetNodeRef: 'composition',
      targetPortId: 'layer-1',
    }],
  });

  assert.equal(result.success, false);
});
