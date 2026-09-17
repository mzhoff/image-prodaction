import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import { getEdgeHasData } from './edge-kind.ts';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import type { TimelineHandoffNodeData } from '@/entities/production-graph/model/types';

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

test('Timeline Handoff JSON stays solid only while its reviewed source is connected', () => {
  const source = createDefaultNode('importImage', { x: 0, y: 0 });
  const sourceAssetId = 'bbbbbbbb-1111-4111-8111-111111111111';
  source.data = { title: 'Video', mediaKind: 'video', assetId: sourceAssetId };
  const timeline = createDefaultNode('timelineHandoff', { x: 500, y: 0 });
  timeline.data = { ...timeline.data, analysis: {
    version: 1, sourceAssetId, sourceChecksum: 'a'.repeat(64), durationMs: 1000, frameTimesMs: [0, 500],
    shots: [{ id: 'shot', startMs: 0, endMs: 1000, frames: [{ timeMs: 500 }], description: 'Reviewed' }],
  } } as TimelineHandoffNodeData;
  const incoming = { ...createEdge(source.id, 'original'), targetNodeId: timeline.id, targetPortId: 'video' };
  const outgoing = { ...createEdge(timeline.id, 'timeline'), id: 'result' };
  const nodes = new Map([[source.id, source], [timeline.id, timeline]]);
  assert.equal(getEdgeHasData(outgoing, nodes, [incoming, outgoing]), true);
  assert.equal(getEdgeHasData(outgoing, nodes, [outgoing]), false);
  source.data = { ...source.data, assetId: 'cccccccc-1111-4111-8111-111111111111' };
  assert.equal(getEdgeHasData(outgoing, nodes, [incoming, outgoing]), false);
});

test('video outputs and routers are solid only for an available, source-matched asset', () => {
  const source = { ...textPrompt(''), id: 'video-import', type: 'importImage', data: {
    title: 'Import', mediaKind: 'video', assetId: 'video', videoOnlyAssetId: 'muted', videoDerivedSourceAssetId: 'old-video',
  } } as ProductionNode;
  const originalEdge = createEdge(source.id, 'original');
  const videoEdge = createEdge(source.id, 'video');
  const nodes = new Map([[source.id, source]]);
  assert.equal(getEdgeHasData(originalEdge, nodes, [originalEdge]), true);
  assert.equal(getEdgeHasData(videoEdge, nodes, [videoEdge]), false);
  const router = { ...textPrompt(''), id: 'router', type: 'router', data: { title: 'Router' } } as ProductionNode;
  nodes.set(router.id, router);
  const incoming = { ...videoEdge, targetNodeId: router.id, targetPortId: 'input' };
  const outgoing = createEdge(router.id, 'output');
  assert.equal(getEdgeHasData(outgoing, nodes, [incoming, outgoing]), false);
  incoming.sourcePortId = 'original';
  assert.equal(getEdgeHasData(outgoing, nodes, [incoming, outgoing]), true);
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
