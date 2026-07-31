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
