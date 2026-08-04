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
