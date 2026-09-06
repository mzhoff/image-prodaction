import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import { getEdgeHasData } from './edge-kind.ts';

test('treats a Pipeline Input contract binding as solid without a design-time value', () => {
  const source = pipelineInput();
  const edge = createEdge(source.id, 'field:article-field');

  assert.equal(getEdgeHasData(edge, new Map([[source.id, source]]), [edge]), true);
});

test('keeps a genuinely empty local text source marked as empty', () => {
  const source = textPrompt('');
  const edge = createEdge(source.id, 'text');

  assert.equal(getEdgeHasData(edge, new Map([[source.id, source]]), [edge]), false);
});

function pipelineInput() {
  return {
    id: 'pipeline-input',
    type: 'pipelineInput',
    position: { x: 0, y: 0 },
    size: { width: 300, height: 200 },
    status: 'idle',
    data: {
      title: 'Pipeline Input',
      fields: [{ id: 'article-field', key: 'articleSummary', kind: 'text', required: true }],
    },
  } as ProductionNode;
}

function textPrompt(text: string) {
  return {
    id: 'text-source',
    type: 'textPrompt',
    position: { x: 0, y: 0 },
    size: { width: 300, height: 360 },
    status: 'idle',
    data: { title: 'Text Prompt', text, result: '', variables: [] },
  } as ProductionNode;
}

function createEdge(sourceNodeId: string, sourcePortId: string) {
  return {
    id: 'edge',
    sourceNodeId,
    sourcePortId,
    targetNodeId: 'target',
    targetPortId: 'variable-0',
  } as GraphEdge;
}
