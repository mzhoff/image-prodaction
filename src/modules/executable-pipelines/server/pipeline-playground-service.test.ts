import assert from 'node:assert/strict';
import test from 'node:test';
import { mapPipelinePlaygroundDescriptor } from './pipeline-playground-service';

test('playground descriptor keeps Studio labels and compiled input requirements', () => {
  const descriptor = mapPipelinePlaygroundDescriptor({
    compiledPlan: {
      definition: {
        schemaVersion: 1,
        inputs: {
          article: { kind: 'text', required: true, description: 'Full article text' },
          reference: { kind: 'image', required: false },
        },
        nodes: [],
        outputs: {
          result: { nodeId: 'text-node', outputKey: 'text' },
        },
      },
      executionLevels: [],
    },
    endpointPublicId: 'pln_019fb9e98e757364b4c34ca908554584',
    executionPolicy: {},
    name: 'Article summary',
    pipelineId: 'pipeline-1',
    pipelineVersion: 2,
    sourceMetadata: {
      sectionId: 'section-1',
      sectionTitle: 'Article summary',
      nodeCount: 3,
      inputs: [
        {
          kind: 'text',
          name: 'article',
          nodeId: 'input-1',
          nodeTitle: 'Source article',
          portId: 'output',
        },
      ],
      outputs: [
        {
          kind: 'text',
          name: 'result',
          nodeId: 'text-node',
          nodeTitle: 'Short description',
          portId: 'text',
        },
      ],
    },
    workspaceId: 'workspace-1',
  });

  assert.equal(descriptor.name, 'Article summary');
  assert.deepEqual(descriptor.inputs, [
    {
      name: 'article',
      label: 'Source article',
      description: 'Full article text',
      kind: 'text',
      required: true,
    },
    {
      name: 'reference',
      label: 'Reference',
      description: null,
      kind: 'image',
      required: false,
    },
  ]);
  assert.deepEqual(descriptor.outputs, [
    { name: 'result', label: 'Short description', kind: 'text' },
  ]);
});

test('descriptor exposes the published schema and defaults for typed Playground inputs', () => {
  const schema = { type: 'object' as const, properties: { count: { type: 'integer' as const, minimum: 1 } }, required: ['count'], additionalProperties: false as const };
  const descriptor = mapPipelinePlaygroundDescriptor({
    compiledPlan: { definition: { schemaVersion: 1, inputs: {
      options: { kind: 'json', required: true, schema, defaultValue: { count: 1 } },
      enabled: { kind: 'boolean', required: true, defaultValue: false },
      count: { kind: 'number', required: false, defaultValue: 0 },
      clip: { kind: 'video', required: true, description: 'Видео для монтажа' },
    }, nodes: [], outputs: {} }, executionLevels: [] },
    endpointPublicId: 'pln_019fb9e98e757364b4c34ca908554584', executionPolicy: {}, name: 'Media',
    pipelineId: 'pipeline-1', pipelineVersion: 3, sourceMetadata: null, workspaceId: 'workspace-1',
  });
  assert.deepEqual(descriptor.inputs[0]?.schema, schema);
  assert.deepEqual(descriptor.inputs[0]?.defaultValue, { count: 1 });
  assert.equal(descriptor.inputs[1]?.defaultValue, false);
  assert.equal(descriptor.inputs[2]?.defaultValue, 0);
  assert.equal(descriptor.inputs[3]?.kind, 'video');
  assert.equal(descriptor.inputs[3]?.description, 'Видео для монтажа');
});
