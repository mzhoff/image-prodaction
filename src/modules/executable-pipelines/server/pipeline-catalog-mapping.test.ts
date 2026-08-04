import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompiledPipelinePlan } from '../contracts/pipeline-contracts';
import { mapExecutablePipelineCatalogRow } from './pipeline-catalog-mapping';

const compiledPlan: CompiledPipelinePlan = {
  definition: {
    schemaVersion: 1,
    inputs: { brief: { kind: 'text', required: true } },
    nodes: [{
      id: 'generate',
      config: {},
      handlerType: 'ai.image.generate',
      handlerVersion: '1',
      inputs: { prompt: { source: 'pipeline-input', inputKey: 'brief' } },
    }],
    outputs: { cover: { nodeId: 'generate', outputKey: 'image' } },
  },
  executionLevels: [['generate']],
};

test('catalog mapping keeps usage totals and studio boundary names', () => {
  const item = mapExecutablePipelineCatalogRow({
    averageCostUsd: '0.0125',
    compiledPlan,
    description: null,
    endpointPublicId: 'pln_test',
    invocationCount: 4,
    name: 'Cover generator',
    originDocumentId: 'document-1',
    originDocumentName: 'Campaign',
    originSectionId: 'section-1',
    pipelineId: 'pipeline-1',
    publishedAt: new Date('2026-08-01T10:00:00.000Z'),
    sourceMetadata: {
      sectionId: 'section-1',
      sectionTitle: 'Cover generator',
      nodeCount: 2,
      inputs: [{ kind: 'text', name: 'brief', nodeId: 'input', nodeTitle: 'Creative brief', portId: 'text' }],
      outputs: [{ kind: 'image', name: 'cover', nodeId: 'preview', nodeTitle: 'Final cover', portId: 'image' }],
    },
    totalCostUsd: '0.05',
    totalTokens: '800',
    version: 3,
  });

  assert.equal(item.inputs[0]?.nodeTitle, 'Creative brief');
  assert.equal(item.outputs[0]?.nodeTitle, 'Final cover');
  assert.deepEqual(item.stats, {
    averageCostUsd: '0.0125',
    invocationCount: 4,
    totalCostUsd: '0.05',
    totalTokens: '800',
  });
});

test('catalog mapping falls back to compiled contracts and zero metrics', () => {
  const item = mapExecutablePipelineCatalogRow({
    averageCostUsd: null,
    compiledPlan,
    description: null,
    endpointPublicId: 'pln_test',
    invocationCount: null,
    name: 'Legacy pipeline',
    originDocumentId: null,
    originDocumentName: null,
    originSectionId: null,
    pipelineId: 'pipeline-1',
    publishedAt: new Date('2026-08-01T10:00:00.000Z'),
    sourceMetadata: null,
    totalCostUsd: null,
    totalTokens: null,
    version: 1,
  });

  assert.deepEqual(item.inputs.map(({ kind, name }) => ({ kind, name })), [{ kind: 'text', name: 'brief' }]);
  assert.deepEqual(item.outputs.map(({ kind, name }) => ({ kind, name })), [{ kind: 'image', name: 'cover' }]);
  assert.deepEqual(item.stats, {
    averageCostUsd: '0',
    invocationCount: 0,
    totalCostUsd: '0',
    totalTokens: '0',
  });
});
