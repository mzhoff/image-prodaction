import assert from 'node:assert/strict';
import test from 'node:test';
import type { PipelineExecutionContext } from '../contracts/pipeline-contracts';
import { createProductionPipelineHandlerRegistry } from './pipeline-production-handlers';
import { PRODUCTION_PIPELINE_NODE_MANIFEST } from './pipeline-production-manifest';

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

  const renderedSourceAlias = await template.execute({
    config: {
      template: 'Композиция:\n@Композиция\nLegacy: @Variable 1',
      variables: [{
        id: 'variable-0',
        alias: 'Композиция',
        mentionAliases: ['Variable 1'],
      }],
    },
    context,
    inputs: { 'variable-0': 'Вид с высоты птичьего полета; бюджет $1 и $&' },
    nodeId: 'template-source-alias',
    signal: new AbortController().signal,
  });
  assert.deepEqual(renderedSourceAlias, {
    text: 'Композиция:\nВид с высоты птичьего полета; бюджет $1 и $&\nLegacy: Вид с высоты птичьего полета; бюджет $1 и $&',
  });

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

test('production registry implements every operation declared in its manifest', () => {
  const registry = createProductionPipelineHandlerRegistry(
    { actorUserId: 'user-1' },
    {
      analyzeImage: async () => 'Analyzed',
      generateImage: async () => ({ assetId: 'asset-1', kind: 'image' }),
      generateText: async () => 'Generated',
    },
  );
  for (const operation of PRODUCTION_PIPELINE_NODE_MANIFEST) {
    assert.ok(
      registry.resolve(operation.handlerType, operation.handlerVersion),
      `${operation.handlerType}@${operation.handlerVersion}`,
    );
  }
});

test('production deterministic handlers split and format text like the studio', async () => {
  const registry = createProductionPipelineHandlerRegistry({ actorUserId: 'user-1' });
  const splitter = registry.resolve('text.split', '1');
  const formatter = registry.resolve('text.format', '1');
  assert.ok(splitter);
  assert.ok(formatter);

  const split = await splitter.execute({
    config: { delimiter: '*', mode: 'delimiter' },
    context,
    inputs: { text: ' First * Second ' },
    nodeId: 'splitter',
    signal: new AbortController().signal,
  });
  assert.deepEqual(split, {
    items: ['First', 'Second'],
    'item-0': 'First',
    'item-1': 'Second',
  });
  assert.deepEqual(await formatter.execute({
    config: { fallbackText: 'Fallback' },
    context,
    inputs: { text: '\u00a0 Ready \u00a0' },
    nodeId: 'formatter',
    signal: new AbortController().signal,
  }), { text: 'Ready' });
});

test('production image handlers return typed results through injected durable services', async () => {
  const calls: string[] = [];
  const registry = createProductionPipelineHandlerRegistry(
    { actorUserId: 'user-1' },
    {
      analyzeImage: async ({ artifact }) => {
        calls.push(`analyze:${artifact.assetId}`);
        return 'Description';
      },
      exportImage: async ({ artifacts }) => {
        calls.push(`export:${artifacts.map((artifact) => artifact.assetId).join(',')}`);
        return artifacts.map((artifact, index) => ({
          ...artifact,
          assetId: `asset-export-${index + 1}`,
          mimeType: 'image/webp',
        }));
      },
      generateImage: async ({ textInputs }) => {
        calls.push(`generate:${textInputs[0]?.text}`);
        return {
          assetId: 'asset-output',
          kind: 'image',
          mimeType: 'image/png',
          sizeBytes: 128,
        };
      },
    },
  );
  const analyze = registry.resolve('ai.image.analyze', '1');
  const generate = registry.resolve('ai.image.generate', '1');
  const exportImage = registry.resolve('image.export', '1');
  assert.ok(analyze);
  assert.ok(generate);
  assert.ok(exportImage);
  assert.deepEqual(await analyze.execute({
    config: { model: 'model', prompt: 'Describe' },
    context,
    inputs: { image: { assetId: 'asset-input', kind: 'image' } },
    nodeId: 'analyze',
    signal: new AbortController().signal,
  }), { text: 'Description' });
  assert.deepEqual(await generate.execute({
    config: { model: 'model', prompt: '' },
    context,
    inputs: { prompt: 'Draw a house' },
    nodeId: 'generate',
    signal: new AbortController().signal,
  }), {
    image: {
      assetId: 'asset-output',
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: 128,
    },
  });
  assert.deepEqual(await exportImage.execute({
    config: { background: 'white', format: 'webp', quality: '90', scale: '1' },
    context,
    inputs: {
      'image-1': { assetId: 'asset-second', kind: 'image' },
      'image-0': { assetId: 'asset-first', kind: 'image' },
    },
    nodeId: 'export',
    signal: new AbortController().signal,
  }), {
    image: {
      assetId: 'asset-export-1',
      kind: 'image',
      mimeType: 'image/webp',
    },
    images: [
      {
        assetId: 'asset-export-1',
        kind: 'image',
        mimeType: 'image/webp',
      },
      {
        assetId: 'asset-export-2',
        kind: 'image',
        mimeType: 'image/webp',
      },
    ],
  });
  assert.deepEqual(calls, [
    'analyze:asset-input',
    'generate:Draw a house',
    'export:asset-first,asset-second',
  ]);
});
