import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { canConnectPorts, getNodePorts } from './node-definitions';
import { getNodeVideoAssetId } from './graph-video-io';
import { normalizeNode } from './normalize-project-node';
import { clearCopiedNodeExecution } from './speech-request';
import { NODE_HELP_METADATA } from './node-help';
import type { GenerateVideoNodeData } from './types';
import { collectVideoRequest } from './video-generation-inputs';
import { sanitizePipelineNodeSettings } from '@/modules/chat-assistant/core/pipeline-node-settings';
import type { AssetRecord, CropImageNodeData, ExportImageNodeData } from './types';
import { createExportImageResultSignature } from './export-image-result';

test('Generate Video exposes only the typed inputs of the selected exclusive mode', () => {
  const node = createDefaultNode('generateVideo', { x: 400, y: 0 });
  const image = createDefaultNode('importImage', { x: 0, y: 0 });
  const text = createDefaultNode('textPrompt', { x: 0, y: 400 });
  const timeline = createDefaultNode('timelineHandoff', { x: 800, y: 0 });
  const ports = getNodePorts(node);
  assert.deepEqual(ports.map((p) => p.id), ['prompt', 'video']);
  assert.equal(canConnectPorts(image, 'image', node, 'first-frame'), false);
  assert.equal(canConnectPorts(text, 'text', node, 'prompt'), true);
  assert.equal(canConnectPorts(text, 'text', node, 'last-frame'), false);
  assert.equal(canConnectPorts(node, 'video', timeline, 'video'), true);
  const frameNode = { ...node, data: { ...node.data, mode: 'frames' as const } };
  const referenceNode = { ...node, data: { ...node.data, mode: 'references' as const, model: 'openai/sora-2-pro' } };
  assert.deepEqual(getNodePorts(frameNode).map((p) => p.id), ['prompt', 'first-frame', 'last-frame', 'video']);
  assert.equal(canConnectPorts(image, 'image', frameNode, 'first-frame'), true);
  assert.deepEqual(getNodePorts(referenceNode).map((p) => p.id), ['prompt', 'reference-1', 'reference-2', 'reference-3', 'video']);
  const data = node.data as GenerateVideoNodeData;
  assert.equal(getNodeVideoAssetId({ ...node, data: { ...data, resultAssetIds: ['one', 'two'], activeResultIndex: 1 } }, 'video'), 'two');
});
test('pending connected images never silently degrade to text-to-video', () => {
  const image = createDefaultNode('importImage', { x: 0, y: 0 });
  const node = createDefaultNode('generateVideo', { x: 400, y: 0 });
  const data = { ...node.data, mode: 'frames' as const } as GenerateVideoNodeData;
  assert.throws(() => collectVideoRequest(node.id, data, { nodes: [image, node], assets: [],
    edges: [{ id: 'edge', sourceNodeId: image.id, sourcePortId: 'image', targetNodeId: node.id, targetPortId: 'first-frame' }] }), /ещё не готово/);
});
test('inactive image connections are dormant and do not leak into another video mode', () => {
  const image = createDefaultNode('importImage', { x: 0, y: 0 });
  const node = createDefaultNode('generateVideo', { x: 400, y: 0 });
  const request = collectVideoRequest(node.id, node.data as GenerateVideoNodeData, { nodes: [image, node], assets: [],
    edges: [{ id: 'edge', sourceNodeId: image.id, sourcePortId: 'image', targetNodeId: node.id, targetPortId: 'first-frame' }] });
  assert.equal(request.mode, 'text');
  assert.equal(request.firstFrame, undefined);
  assert.deepEqual(request.references, []);
});
test('Crop and Export local outputs are valid frame/reference drafts without substituting the original', () => {
  const image = createDefaultNode('importImage', { x: 0, y: 0 });
  image.data = { ...image.data, assetId: 'original' };
  const crop = createDefaultNode('cropImage', { x: 400, y: 0 });
  crop.data = { ...crop.data, resultAssetId: 'cropped', sourceAssetId: 'original' } as CropImageNodeData;
  const exported = createDefaultNode('exportImage', { x: 800, y: 0 });
  exported.data = { ...exported.data, sourceAssetId: 'cropped', resultAssetId: 'converted',
    resultSignature: createExportImageResultSignature('cropped', exported.data as ExportImageNodeData) } as ExportImageNodeData;
  const video = createDefaultNode('generateVideo', { x: 1200, y: 0 });
  const assets = ['original', 'cropped', 'converted'].map((id): AssetRecord => ({ id, name: `${id}.png`, kind: 'image', mimeType: 'image/png', createdAt: '', storage: { type: 'indexeddb', blobKey: id } }));
  const upstream = [
    { id: 'to-crop', sourceNodeId: image.id, sourcePortId: 'image', targetNodeId: crop.id, targetPortId: 'image' },
    { id: 'to-export', sourceNodeId: crop.id, sourcePortId: 'result', targetNodeId: exported.id, targetPortId: 'image-0' },
  ];
  for (const source of [crop, exported]) for (const port of ['first-frame', 'last-frame', 'reference-1', 'reference-2', 'reference-3']) {
    const data = { ...video.data, mode: port.startsWith('reference') ? 'references' : 'frames' } as GenerateVideoNodeData;
    const context = { nodes: [image, crop, exported, video], assets,
      edges: [...upstream, { id: 'to-video', sourceNodeId: source.id, sourcePortId: source === crop ? 'result' : 'image', targetNodeId: video.id, targetPortId: port }] };
    const payload = collectVideoRequest(video.id, data, context);
    const selected = port === 'first-frame' ? payload.firstFrame : port === 'last-frame' ? payload.lastFrame : payload.references[0];
    assert.equal(selected?.assetId, source === crop ? 'cropped' : 'converted');
    assert.throws(() => collectVideoRequest(video.id, data, { ...context, assets: assets.filter((asset) => asset.id !== selected?.assetId) }), /ещё не готово/);
  }
});
test('video defaults survive normalization; copying strips pending jobs and keeps settings', () => {
  const node = createDefaultNode('generateVideo', { x: 0, y: 0 });
  const data = normalizeNode({ ...node, data: { title: 'Video' } }).data as GenerateVideoNodeData;
  assert.equal(data.duration, 4); assert.deepEqual(data.resultAssetIds, []);
  const copied = clearCopiedNodeExecution({ ...node, data: { ...node.data, videoRequest: { jobId: 'fake' } } as GenerateVideoNodeData });
  assert.equal((copied.data as GenerateVideoNodeData).videoRequest, undefined);
  assert.equal((copied.data as GenerateVideoNodeData).model, data.model);
});
test('assistant exposes video settings without execution internals and explains the same ports', () => {
  const safe = sanitizePipelineNodeSettings('generateVideo', { mode: 'frames', duration: 4, generateAudio: true, seed: 0,
    resolution: '720p', referenceDescriptions: ['', 'hero'], videoRequest: { jobId: 'fake' }, resultAssetIds: ['fake'] });
  assert.deepEqual(safe, { mode: 'frames', duration: 4, generateAudio: true, seed: 0, resolution: '720p', referenceDescriptions: ['', 'hero'] });
  assert.match(NODE_HELP_METADATA.generateVideo.portRules.join(' '), /first-frame.*last-frame.*reference-1/);
  assert.match(NODE_HELP_METADATA.generateVideo.limitations.join(' '), /ZDR/);
  assert.match(NODE_HELP_METADATA.generateVideo.capabilities.join(' '), /Crop.*Export.*сервер/);
});
