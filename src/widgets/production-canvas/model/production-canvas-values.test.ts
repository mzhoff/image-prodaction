import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { hasClearableGenerationData } from './production-canvas-values';

test('canvas generation cleanup is offered only when a node has generated output', () => {
  assert.equal(hasClearableGenerationData(createNode('generateImage', {
    resultAssetIds: ['asset-1'],
  })), true);
  assert.equal(hasClearableGenerationData(createNode('generateImage', {
    resultAssetIds: [],
  })), false);
  assert.equal(hasClearableGenerationData(createNode('textGeneration', {
    resultTexts: ['result'],
  })), true);
  assert.equal(hasClearableGenerationData(createNode('subjectBuilder', {
    libraryImageAssetIds: [],
  })), false);
  assert.equal(hasClearableGenerationData(createNode('importImage', {
    resultAssetId: 'asset-2',
  })), true);
});

function createNode(type: ProductionNode['type'], data: Record<string, unknown>) {
  return {
    id: `node-${type}`,
    type,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    status: 'idle',
    data,
  } as unknown as ProductionNode;
}
