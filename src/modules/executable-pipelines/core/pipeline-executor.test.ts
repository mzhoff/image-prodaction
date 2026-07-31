import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  PipelineNodeHandler,
  PipelineValue,
} from '../contracts/pipeline-contracts';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import { createTextPipelineFixture } from '../testing/pipeline-fixtures';
import { createStaticPipelineHandlerRegistry } from '../testing/static-pipeline-handler-registry';
import { compilePipelineDefinition } from './pipeline-compiler';
import { executeCompiledPipeline } from './pipeline-executor';

test('executor resolves bindings and runs independent nodes in one level', async () => {
  const started: string[] = [];
  const result = await executeCompiledPipeline({
    plan: compilePipelineDefinition(createTextPipelineFixture()),
    handlers: createStaticPipelineHandlerRegistry(createTextHandlers(started)),
    inputs: {
      topic: '  executable pipelines  ',
    },
    context: {
      pipelineId: 'pipeline-1',
      pipelineVersion: 1,
      runId: 'run-1',
      sourceApplication: 'test',
      workspaceId: 'workspace-1',
    },
    signal: new AbortController().signal,
  });

  assert.equal(result.outputs.text, 'Topic: executable pipelines | executable pipelines!');
  assert.deepEqual(started, ['normalize', 'prefix', 'suffix', 'join']);
});

test('executor rejects unknown or incorrectly typed pipeline input', async () => {
  const plan = compilePipelineDefinition(createTextPipelineFixture());
  const handlers = createStaticPipelineHandlerRegistry(createTextHandlers([]));
  const base = {
    plan,
    handlers,
    context: {
      pipelineId: 'pipeline-1',
      pipelineVersion: 1,
      runId: 'run-1',
      sourceApplication: 'test',
      workspaceId: 'workspace-1',
    },
    signal: new AbortController().signal,
  };

  await assert.rejects(
    executeCompiledPipeline({ ...base, inputs: {} }),
    (error: unknown) => (
      error instanceof PipelineDomainError
      && error.code === 'pipeline_input_invalid'
    ),
  );
  await assert.rejects(
    executeCompiledPipeline({ ...base, inputs: { topic: 42 } }),
    /does not match kind "text"/,
  );
  await assert.rejects(
    executeCompiledPipeline({ ...base, inputs: { topic: 'ok', extra: true } }),
    /Unknown pipeline input "extra"/,
  );
});

test('executor reports a missing declared node output safely', async () => {
  const handlers = createTextHandlers([]).map((handler) => (
    handler.handlerType === 'text.join'
      ? {
        ...handler,
        async execute() {
          return {};
        },
      }
      : handler
  ));

  await assert.rejects(
    executeCompiledPipeline({
      plan: compilePipelineDefinition(createTextPipelineFixture()),
      handlers: createStaticPipelineHandlerRegistry(handlers),
      inputs: { topic: 'pipelines' },
      context: {
        pipelineId: 'pipeline-1',
        pipelineVersion: 1,
        runId: 'run-1',
        sourceApplication: 'test',
        workspaceId: 'workspace-1',
      },
      signal: new AbortController().signal,
    }),
    (error: unknown) => (
      error instanceof PipelineDomainError
      && error.code === 'pipeline_node_output_missing'
    ),
  );
});

function createTextHandlers(started: string[]): PipelineNodeHandler[] {
  return [
    {
      handlerType: 'text.normalize',
      handlerVersion: '1',
      async execute(input) {
        started.push(input.nodeId);
        return { text: String(input.inputs.text).trim() };
      },
    },
    {
      handlerType: 'text.affix',
      handlerVersion: '1',
      async execute(input) {
        started.push(input.nodeId);
        const text = String(input.inputs.text);
        const affix = String(input.config.affix);
        return {
          text: input.config.position === 'prefix'
            ? `${affix}${text}`
            : `${text}${affix}`,
        };
      },
    },
    {
      handlerType: 'text.join',
      handlerVersion: '1',
      async execute(input) {
        started.push(input.nodeId);
        return {
          text: [
            input.inputs.left,
            input.inputs.right,
          ].join(String(input.config.separator as PipelineValue)),
        };
      },
    },
  ];
}
