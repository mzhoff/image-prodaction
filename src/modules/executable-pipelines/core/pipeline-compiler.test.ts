import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import { createTextPipelineFixture } from '../testing/pipeline-fixtures';
import { compilePipelineDefinition } from './pipeline-compiler';

test('compiler builds deterministic parallel execution levels', () => {
  const plan = compilePipelineDefinition(createTextPipelineFixture(), {
    isHandlerSupported: () => true,
  });

  assert.deepEqual(plan.executionLevels, [
    ['normalize'],
    ['prefix', 'suffix'],
    ['join'],
  ]);
});

test('compiler rejects a cycle before any handler can run', () => {
  const definition = createTextPipelineFixture();
  definition.nodes[0].inputs = {
    loop: {
      source: 'node-output',
      nodeId: 'join',
      outputKey: 'text',
    },
  };

  assert.throws(
    () => compilePipelineDefinition(definition),
    (error: unknown) => (
      error instanceof PipelineDomainError
      && error.code === 'pipeline_cycle_detected'
    ),
  );
});

test('compiler rejects missing dependencies and unsupported handler versions', () => {
  const missingDependency = createTextPipelineFixture();
  missingDependency.nodes[1].inputs.text = {
    source: 'node-output',
    nodeId: 'missing',
    outputKey: 'text',
  };
  assert.throws(
    () => compilePipelineDefinition(missingDependency),
    /unknown source node "missing"/,
  );

  assert.throws(
    () => compilePipelineDefinition(createTextPipelineFixture(), {
      isHandlerSupported: (type) => type !== 'text.join',
    }),
    (error: unknown) => (
      error instanceof PipelineDomainError
      && error.code === 'pipeline_handler_missing'
    ),
  );
});

test('compiler validates defaults and required output contracts without breaking legacy plans', () => {
  const invalidDefault = createTextPipelineFixture();
  invalidDefault.inputs.topic.defaultValue = 42;
  assert.throws(
    () => compilePipelineDefinition(invalidDefault),
    /defaultValue must be text/,
  );

  const missingRequiredOutput = createTextPipelineFixture();
  missingRequiredOutput.outputContracts = {
    text: { kind: 'text', required: true },
    summary: { kind: 'text', required: true },
  };
  assert.throws(
    () => compilePipelineDefinition(missingRequiredOutput),
    /Required pipeline output "summary" has no binding/,
  );

  assert.doesNotThrow(() => compilePipelineDefinition(createTextPipelineFixture()));
});

test('compiler rejects an output semantic contract without enforceable output fields', () => {
  const definition = createTextPipelineFixture();
  definition.outputSemanticContract = {
    contractKey: 'test.output.v1',
    contractRef: 'contracts/test-output/1.0.0/schema.json',
    contractVersion: '1.0.0',
    schemaChecksum: '0'.repeat(64),
    schema: {
      additionalProperties: false,
      properties: { text: { type: 'string' } },
      required: ['text'],
      type: 'object',
    },
  };

  assert.throws(
    () => compilePipelineDefinition(definition),
    /output semantic contract requires outputContracts/,
  );
});

test('compiler reports malformed semantic snapshots as controlled definition errors', () => {
  const definition = createTextPipelineFixture();
  definition.inputSemanticContract = {
    contractKey: 'test.input.v1',
    contractRef: 'contracts/test-input/1.0.0/schema.json',
    contractVersion: '1.0.0',
    schemaChecksum: '0'.repeat(64),
    schema: null,
  } as unknown as NonNullable<typeof definition.inputSemanticContract>;

  assert.throws(
    () => compilePipelineDefinition(definition),
    (error: unknown) => (
      error instanceof PipelineDomainError
      && error.code === 'pipeline_definition_invalid'
      && /schema must be an object/.test(error.message)
    ),
  );
});
