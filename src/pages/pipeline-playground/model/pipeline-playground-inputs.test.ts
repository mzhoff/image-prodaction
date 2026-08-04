import assert from 'node:assert/strict';
import test from 'node:test';
import type { PipelinePlaygroundField } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import { buildPipelinePlaygroundInput } from './pipeline-playground-inputs';

const fields: PipelinePlaygroundField[] = [
  {
    name: 'article',
    label: 'Article',
    description: null,
    kind: 'text',
    required: true,
  },
  {
    name: 'reference',
    label: 'Reference',
    description: null,
    kind: 'image',
    required: true,
  },
];

test('playground input stays disabled until required text and image are ready', () => {
  assert.equal(buildPipelinePlaygroundInput(fields, {}).ready, false);
  const textOnly = buildPipelinePlaygroundInput(fields, { article: 'Source text' });
  assert.equal(textOnly.ready, false);
  const complete = buildPipelinePlaygroundInput(fields, {
    article: 'Source text',
    reference: { kind: 'image', assetId: 'asset-1' },
  });
  assert.deepEqual(complete, {
    errors: {},
    input: {
      article: 'Source text',
      reference: { kind: 'image', assetId: 'asset-1' },
    },
    ready: true,
  });
});

test('playground input parses lines, numbers and JSON into runtime values', () => {
  const result = buildPipelinePlaygroundInput([
    { name: 'items', label: 'Items', description: null, kind: 'text_collection', required: true },
    { name: 'count', label: 'Count', description: null, kind: 'number', required: true },
    { name: 'options', label: 'Options', description: null, kind: 'json', required: true },
  ], {
    items: 'First\n\nSecond',
    count: '2',
    options: '{"enabled":true}',
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.input, {
    items: ['First', 'Second'],
    count: 2,
    options: { enabled: true },
  });
});
