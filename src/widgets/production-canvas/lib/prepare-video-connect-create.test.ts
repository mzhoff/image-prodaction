import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { canConnectPorts, getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { GenerateVideoNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { DEFAULT_VIDEO_MODEL, type VideoModelCapabilities } from '@/shared/media/video-generation-contracts';
import { getVideoConnectCreateMode, prepareVideoConnectCreate } from './prepare-video-connect-create';

const frameModel: VideoModelCapabilities = { key: DEFAULT_VIDEO_MODEL, label: 'Frames', description: '',
  route: { gateway: 'openrouter', modelId: DEFAULT_VIDEO_MODEL }, durations: [4], resolutions: ['720p'], aspectRatios: ['16:9'],
  firstFrame: true, lastFrame: true, references: false, audio: true, seed: false };
const referenceModel: VideoModelCapabilities = { ...frameModel, key: 'test/references', references: true, durations: [5], resolutions: ['1080p'], aspectRatios: ['9:16'] };

test('Timeline Frames create a reference-capable node and the actual store retains its wire', () => {
  const source = createDefaultNode('timelineHandoff', { x: 0, y: 0 });
  const mode = getVideoConnectCreateMode(source.id, 'frames', { nodes: [source], edges: [] });
  assert.equal(mode, 'references');
  const prepared = prepareVideoConnectCreate(mode!, [frameModel, referenceModel]);
  assert.equal(prepared.targetPortId, 'reference-1');
  assert.deepEqual(prepared.data, { mode: 'references', model: referenceModel.key, duration: 5, resolution: '1080p', aspectRatio: '9:16', generateAudio: false });
  const node = createDefaultNode('generateVideo', { x: 300, y: 0 });
  node.data = { ...node.data, ...prepared.data } as GenerateVideoNodeData;
  assert.ok(getNodePorts(node).some((port) => port.id === prepared.targetPortId));
  assert.ok(canConnectPorts(source, 'frames', node, prepared.targetPortId));
  useProductionGraphStore.setState({ nodes: [source, node], edges: [], historyPast: [], historyFuture: [] });
  assert.deepEqual(useProductionGraphStore.getState().connect(source.id, 'frames', node.id, prepared.targetPortId), { ok: true });
  assert.equal(useProductionGraphStore.getState().edges[0]?.targetPortId, 'reference-1');
});

test('ordinary images activate frames and preserve a compatible default model', () => {
  const source = createDefaultNode('importImage', { x: 0, y: 0 });
  assert.equal(getVideoConnectCreateMode(source.id, 'image', { nodes: [source], edges: [] }), 'frames');
  const prepared = prepareVideoConnectCreate('frames', [referenceModel, frameModel]);
  assert.equal(prepared.data.mode, 'frames');
  assert.equal(prepared.data.model, DEFAULT_VIDEO_MODEL);
  assert.equal(prepared.targetPortId, 'first-frame');
});

test('Timeline Frames remain a gallery through Router and other Timeline outputs do not activate image mode', () => {
  const timeline = createDefaultNode('timelineHandoff', { x: 0, y: 0 });
  const router = createDefaultNode('router', { x: 150, y: 0 });
  const context = { nodes: [timeline, router], edges: [{ id: 'wire', sourceNodeId: timeline.id, sourcePortId: 'frames', targetNodeId: router.id, targetPortId: 'input' }] };
  assert.equal(getVideoConnectCreateMode(router.id, 'output', context), 'references');
  assert.equal(getVideoConnectCreateMode(timeline.id, 'descriptions', context), undefined);
  assert.equal(getVideoConnectCreateMode(timeline.id, 'timeline', context), undefined);
  assert.equal(getVideoConnectCreateMode(router.id, 'output', { ...context, edges: [] }), undefined);
});

test('unavailable image capability fails before callers create a disconnected node', () => {
  assert.throws(() => prepareVideoConnectCreate('references', [frameModel]), /нет видеомодели с поддержкой референсов/);
  assert.throws(() => prepareVideoConnectCreate('frames', []), /нет видеомодели с поддержкой первого кадра/);
  assert.throws(() => prepareVideoConnectCreate('references', [{ ...referenceModel, durations: [] }]), /нет видеомодели/);
});
