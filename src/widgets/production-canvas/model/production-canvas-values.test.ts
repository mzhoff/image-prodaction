import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { NODE_TEMPLATE_DRAG_MIME_TYPE } from '../lib/node-drag';
import { getDraggedNodeTemplateId, hasClearableGenerationData,
  hasDraggedNodeTemplate } from './production-canvas-values';

test('canvas recognizes a saved node template drag payload', () => {
  const dataTransfer = {
    getData: (type: string) => type === NODE_TEMPLATE_DRAG_MIME_TYPE ? 'template-1' : '',
    types: [NODE_TEMPLATE_DRAG_MIME_TYPE],
  } as unknown as DataTransfer;

  assert.equal(hasDraggedNodeTemplate(dataTransfer), true);
  assert.equal(getDraggedNodeTemplateId(dataTransfer), 'template-1');
});

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
