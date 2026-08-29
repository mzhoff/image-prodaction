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
import { executeCompiledPipeline, validatePipelineInputValues } from './pipeline-executor';

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

test('image inputs require a typed artifact reference instead of arbitrary JSON', () => {
  const contracts = {
    image: { kind: 'image' as const, required: true },
  };
  assert.throws(
    () => validatePipelineInputValues(contracts, { image: { assetId: 'asset-1' } }),
    /does not match kind "image"/,
  );
  assert.doesNotThrow(() => validatePipelineInputValues(contracts, {
    image: { assetId: 'asset-1', kind: 'image' },
  }));
});

test('executor applies defaults and omits missing optional inputs from handlers', async () => {
  const definition = createTextPipelineFixture();
  definition.inputs = {
    topic: { kind: 'text', required: true, defaultValue: 'Default topic' },
    optional: { kind: 'text', required: false },
  };
  definition.nodes = [{
    id: 'capture',
    handlerType: 'test.capture',
    handlerVersion: '1',
    config: {},
    inputs: {
      topic: { source: 'pipeline-input', inputKey: 'topic' },
      optional: { source: 'pipeline-input', inputKey: 'optional' },
    },
  }];
  definition.outputs = { text: { nodeId: 'capture', outputKey: 'text' } };
  definition.outputContracts = { text: { kind: 'text', required: true } };
  let captured: Record<string, PipelineValue> | undefined;

  const result = await executeCompiledPipeline({
    plan: compilePipelineDefinition(definition),
    handlers: createStaticPipelineHandlerRegistry([{
      handlerType: 'test.capture',
      handlerVersion: '1',
      async execute(input) {
        captured = input.inputs;
        return { text: String(input.inputs.topic) };
      },
    }]),
    inputs: {},
    context: {
      pipelineId: 'pipeline-1', pipelineVersion: 1, runId: 'run-1',
      sourceApplication: 'test', workspaceId: 'workspace-1',
    },
    signal: new AbortController().signal,
  });

  assert.deepEqual(captured, { topic: 'Default topic' });
  assert.deepEqual(result.outputs, { text: 'Default topic' });
});

test('executor enforces recursive JSON input and output contracts', async () => {
  const schema = {
    type: 'object' as const,
    additionalProperties: false as const,
    properties: {
      title: { type: 'string' as const },
      score: { type: 'number' as const },
    },
    required: ['title'],
  };
  const definition = createTextPipelineFixture();
  definition.inputs = { payload: { kind: 'json', required: true, schema } };
  definition.nodes = [{
    id: 'capture', handlerType: 'test.capture', handlerVersion: '1', config: {},
    inputs: { payload: { source: 'pipeline-input', inputKey: 'payload' } },
  }];
  definition.outputs = { result: { nodeId: 'capture', outputKey: 'result' } };
  definition.outputContracts = { result: { kind: 'json', required: true, schema } };
  const base = {
    plan: compilePipelineDefinition(definition),
    handlers: createStaticPipelineHandlerRegistry([{
      handlerType: 'test.capture', handlerVersion: '1',
      async execute(input: Parameters<PipelineNodeHandler['execute']>[0]) {
        return { result: input.inputs.payload };
      },
    }]),
    context: {
      pipelineId: 'pipeline-1', pipelineVersion: 1, runId: 'run-1',
      sourceApplication: 'test', workspaceId: 'workspace-1',
    },
    signal: new AbortController().signal,
  };

  await assert.rejects(
    executeCompiledPipeline({ ...base, inputs: { payload: 'not-json-object' } }),
    /must be structured JSON/,
  );
  await assert.rejects(
    executeCompiledPipeline({ ...base, inputs: { payload: { title: 'Ready', extra: true } } }),
    /extra is not allowed/,
  );
  await assert.rejects(
    executeCompiledPipeline({
      ...base,
      handlers: createStaticPipelineHandlerRegistry([{
        handlerType: 'test.capture', handlerVersion: '1',
        async execute() { return { result: { score: 10 } }; },
      }]),
      inputs: { payload: { title: 'Ready' } },
    }),
    (error: unknown) => error instanceof PipelineDomainError && error.code === 'pipeline_output_invalid',
  );
  const result = await executeCompiledPipeline({
    ...base,
    inputs: { payload: { title: 'Ready', score: 10 } },
  });
  assert.deepEqual(result.outputs, { result: { title: 'Ready', score: 10 } });
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
