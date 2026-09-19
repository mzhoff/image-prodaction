import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import type { ImportImageNodeData, TextPromptNodeData } from '@/entities/production-graph/model/types';
import { getInputConnectionStatus } from './input-connection-status';

test('input status distinguishes disconnected, connected-empty and resolved typed values', () => {
  const target = createDefaultNode('generateImage', { x: 400, y: 0 });
  const text = createDefaultNode('textPrompt', { x: 0, y: 0 });
  const image = createDefaultNode('importImage', { x: 0, y: 300 });
  const context = { assets: [], nodes: [text, image, target], edges: [] as Array<{
    id: string; sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string;
  }> };

  assert.deepEqual(getInputConnectionStatus(target.id, 'actors', context), {
    kind: 'empty', label: 'Не подключён', state: 'disconnected',
  });
  context.edges.push({ id: 'text', sourceNodeId: text.id, sourcePortId: 'text', targetNodeId: target.id, targetPortId: 'actors' });
  assert.deepEqual(getInputConnectionStatus(target.id, 'actors', context), {
    kind: 'empty', label: 'Empty', state: 'empty',
  });
  text.data = { ...text.data, text: 'A concrete character description' } as TextPromptNodeData;
  assert.deepEqual(getInputConnectionStatus(target.id, 'actors', context), {
    kind: 'text', label: 'Text · 1', state: 'ready',
  });
  image.data = { ...image.data, assetId: '019f1e15-0185-7000-8000-000000000001' } as ImportImageNodeData;
  context.edges.push({ id: 'image', sourceNodeId: image.id, sourcePortId: 'image', targetNodeId: target.id, targetPortId: 'actors' });
  assert.deepEqual(getInputConnectionStatus(target.id, 'actors', context), {
    kind: 'mixed', label: 'Text · 1 + Image · 1', state: 'ready', sourceLabels: ['Prompt', 'Import'], sourceEdgeIds: ['text', 'image'],
  });
});

test('Timeline Frames badges count prepared gallery items through routers and show pending assets', async () => {
  const { createDefaultNode } = await import('@/entities/production-graph/model/create-default-node');
  const sourceId = '019ed347-66a4-7124-8000-000000000011';
  const firstId = '019ed347-66a4-7124-8000-000000000012';
  const secondId = '019ed347-66a4-7124-8000-000000000013';
  const source = createDefaultNode('importImage', { x: 0, y: 0 });
  source.data = { ...source.data, mediaKind: 'video', assetId: sourceId };
  const timeline = createDefaultNode('timelineHandoff', { x: 0, y: 0 });
  timeline.data = { ...timeline.data, analysis: {
    version: 1, sourceAssetId: sourceId, sourceChecksum: 'a'.repeat(64), durationMs: 1000, frameTimesMs: [0, 500],
    shots: [{ id: 'a', startMs: 0, endMs: 1000, description: '', frames: [{ timeMs: 0, assetId: firstId }, { timeMs: 500, assetId: secondId }] }],
  } };
  const router = createDefaultNode('router', { x: 0, y: 0 });
  const graph = { nodes: [source, timeline, router], edges: [
    { id: 'input', sourceNodeId: source.id, sourcePortId: 'original', targetNodeId: timeline.id, targetPortId: 'video' },
    { id: 'router', sourceNodeId: timeline.id, sourcePortId: 'frames', targetNodeId: router.id, targetPortId: 'input' },
    { id: 'output', sourceNodeId: router.id, sourcePortId: 'output', targetNodeId: 'generator', targetPortId: 'reference-1' },
  ], assets: [firstId, secondId].map((id) => ({ id, kind: 'image' as const, name: 'Frame', mimeType: 'image/jpeg', createdAt: '', storage: { type: 'remote' as const, assetId: id } })) };
  assert.deepEqual(getInputConnectionStatus('generator', 'reference-1', graph), { kind: 'image', label: 'Image · 2', state: 'ready', sourceLabels: ['Router'], sourceEdgeIds: ['output'] });
  assert.deepEqual(getInputConnectionStatus('generator', 'reference-1', { ...graph, assets: graph.assets.slice(0, 1) }), { kind: 'empty', label: 'Кадры готовятся', state: 'empty' });
});

test('reference names come from source nodes and reflect rename independently of filenames', () => {
  const target = createDefaultNode('generateVideo', { x: 400, y: 0 });
  const source = createDefaultNode('importImage', { x: 0, y: 0 });
  source.data = { ...source.data, title: 'Главный герой', assetId: 'asset' };
  const context = { nodes: [source, target], assets: [], edges: [
    { id: 'reference', sourceNodeId: source.id, sourcePortId: 'image', targetNodeId: target.id, targetPortId: 'reference-1' },
  ] };
  assert.deepEqual(getInputConnectionStatus(target.id, 'reference-1', context).sourceLabels, ['Главный герой']);
  source.data.title = 'Новое имя';
  assert.deepEqual(getInputConnectionStatus(target.id, 'reference-1', context).sourceLabels, ['Новое имя']);
});
