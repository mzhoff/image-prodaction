import assert from 'node:assert/strict';
import test from 'node:test';
import type { PipelineExecutionContext } from '../contracts/pipeline-contracts';
import { createProductionPipelineHandlerRegistry } from './pipeline-production-handlers';

const context: PipelineExecutionContext = {
  pipelineId: 'pipeline-1',
  pipelineVersion: 1,
  runId: 'run-1',
  sourceApplication: 'test',
  workspaceId: 'workspace-1',
};

test('production text handlers render variables and concatenate inputs deterministically', async () => {
  const registry = createProductionPipelineHandlerRegistry({ actorUserId: 'user-1' });
  const template = registry.resolve('text.template.render', '1');
  const concat = registry.resolve('text.concat', '1');
  assert.ok(template);
  assert.ok(concat);

  const rendered = await template.execute({
    config: {
      template: 'Title: @Generated text',
      variables: [{ id: 'variable-0', alias: 'Generated text' }],
    },
    context,
    inputs: { 'variable-0': 'Ready' },
    nodeId: 'template',
    signal: new AbortController().signal,
  });
  assert.deepEqual(rendered, { text: 'Title: Ready' });

  const concatenated = await concat.execute({
    config: {
      separator: 'space',
      customSeparator: '',
      prefix: 'Before',
      suffix: 'After',
    },
    context,
    inputs: { 'text-1': 'second', 'text-0': 'first' },
    nodeId: 'concat',
    signal: new AbortController().signal,
  });
  assert.deepEqual(concatenated, { text: 'Before first second After' });
});

test('production AI text handler uses the injected durable text generator', async () => {
  const calls: string[] = [];
  const registry = createProductionPipelineHandlerRegistry(
    { actorUserId: 'user-1' },
    { generateText: async ({ text }) => {
      calls.push(text);
      return 'Generated';
    } },
  );
  const handler = registry.resolve('ai.text.generate', '1');
  assert.ok(handler);
  const result = await handler.execute({
    config: {
      instruction: 'Rewrite',
      model: 'google/gemini-2.5-flash',
      outputStyle: 'plain',
    },
    context,
    inputs: { text: 'Draft' },
    nodeId: 'generation',
    signal: new AbortController().signal,
  });
  assert.deepEqual(calls, ['Draft']);
  assert.deepEqual(result, { text: 'Generated' });
});
