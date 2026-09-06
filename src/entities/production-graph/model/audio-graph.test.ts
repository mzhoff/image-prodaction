import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { getAudioConvertResultSignature, getFirstIncomingAudioAsset, getNodeAudioAssetId } from './graph-audio-io';
import { getNodeImageAssetId } from './graph-image-outputs';
import { getNodeTextResult } from './graph-text-outputs';
import { assignImportMedia } from './import-media-assignment';
import { canConnectPorts, getNodePorts } from './node-definitions';
import { createNodeTemplateSnapshot, getNodeTemplateAssetIds } from './node-template-preset';
import { normalizeNode } from './normalize-project-node';
import { initialProject } from './initial-project';
import { createPipelineTemplateExport } from './project-portability';
import { createEmptyProjectUiState } from './project-schema';
import type { AssetRecord, AudioConvertNodeData, ProductionNode, ProductionNodeType } from './types';

const node = (type: ProductionNodeType) => createDefaultNode(type, { x: 0, y: 0 });
const asset: AssetRecord = { id: 'audio-1', kind: 'audio', name: 'Speech.wav', mimeType: 'audio/wav', createdAt: '2026-09-06T00:00:00Z', storage: { type: 'remote', assetId: 'audio-1' } };
const connect = (source: ProductionNode, sourcePortId: string, target: ProductionNode, targetPortId: string) => ({ id: `${source.id}-${target.id}`, sourceNodeId: source.id, sourcePortId, targetNodeId: target.id, targetPortId });

test('audio contracts keep unique port ids and reject direct image/audio mixing', () => {
  const image = node('importImage'); const stt = node('speechToText'); const convert = node('audioConvert'); const voice = node('textToSpeech');
  for (const candidate of [stt, convert, voice]) assert.equal(new Set(getNodePorts(candidate).map((port) => port.id)).size, getNodePorts(candidate).length);
  assert.equal(canConnectPorts(image, 'image', stt, 'audio'), false);
  assert.equal(canConnectPorts(voice, 'audio', convert, 'source'), true);
  assert.equal(canConnectPorts(convert, 'audio', stt, 'audio'), true);
  assert.equal(canConnectPorts(voice, 'audio', node('exportImage'), 'image-0'), false);
  assert.equal(canConnectPorts(stt, 'text', voice, 'text'), true);
});

test('universal import switches its existing port, drops incompatible edges and leaves images unchanged', () => {
  const image = node('importImage'); const imageTarget = node('exportImage'); const stt = node('speechToText');
  const edges = [connect(image, 'image', imageTarget, 'image-0'), connect(image, 'image', stt, 'audio')];
  const assigned = assignImportMedia([image, imageTarget, stt], edges, image.id, asset);
  const imported = assigned.nodes[0];
  assert.deepEqual(getNodePorts(imported), [{ id: 'image', label: 'Audio', kind: 'audio', side: 'output' }]);
  assert.equal(getNodeImageAssetId(imported), undefined);
  assert.equal(getNodeAudioAssetId(imported), asset.id);
  assert.equal(assigned.edges.length, 1); assert.equal(assigned.edges[0].targetNodeId, stt.id);
  const restored = assignImportMedia(assigned.nodes, edges, image.id, { ...asset, kind: 'image' });
  assert.equal(getNodeImageAssetId(restored.nodes[0]), asset.id);
  assert.equal(getNodeAudioAssetId(restored.nodes[0]), undefined);
  assert.equal(restored.edges[0].targetNodeId, imageTarget.id);
});

test('audio passes transparent routers, rejects cycles, and hides a stale converted result', () => {
  const imported = { ...node('importImage'), data: { title: 'Audio', assetId: asset.id, mediaKind: 'audio' as const } };
  const router = node('router'); const convert = node('audioConvert');
  const convertData = { ...convert.data, format: 'mp3', audioAssetId: 'converted', sourceAudioAssetId: asset.id } as AudioConvertNodeData;
  convertData.audioResultSignature = getAudioConvertResultSignature(asset.id, convertData);
  convert.data = convertData;
  const context = { nodes: [imported, router, convert], edges: [connect(imported, 'image', router, 'input'), connect(router, 'output', convert, 'source')], assets: [asset] };
  assert.equal(getFirstIncomingAudioAsset(convert.id, 'source', context)?.id, asset.id);
  assert.equal(getNodeAudioAssetId(convert, context), 'converted');
  convertData.format = 'wav';
  assert.equal(getNodeAudioAssetId(convert, context), undefined);
  convertData.format = 'mp3';
  imported.data.assetId = 'different';
  assert.equal(getNodeAudioAssetId(convert, context), undefined);
  context.edges[0] = connect(router, 'output', router, 'input');
  assert.equal(getNodeAudioAssetId(router, context), undefined);
});

test('audio template and normalization preserve meaningful settings but no request identity', () => {
  const stt = node('speechToText'); stt.data = { title: 'Interview', result: 'Hello', model: 'google/gemini-3.1-flash-lite', language: 'auto', audioAssetId: asset.id, lastRequest: { fingerprint: 'private', idempotencyKey: 'request' } };
  assert.equal(getNodeTextResult(stt), 'Hello');
  const snapshot = createNodeTemplateSnapshot(stt);
  assert.deepEqual(getNodeTemplateAssetIds(snapshot), [asset.id]);
  assert.equal('lastRequest' in snapshot.data, false);
  const normalized = normalizeNode(stt).data;
  assert.equal('language' in normalized && normalized.language, undefined);
  const convert = node('audioConvert'); convert.data = { title: 'Audio', format: 'unsupported', sampleRateHz: -1 } as unknown as AudioConvertNodeData;
  assert.equal((normalizeNode(convert).data as AudioConvertNodeData).format, 'mp3');
  assert.equal((normalizeNode(convert).data as AudioConvertNodeData).sampleRateHz, undefined);
  const portable = createPipelineTemplateExport({ ...structuredClone(initialProject), nodes: [stt] }, createEmptyProjectUiState());
  assert.equal('audioAssetId' in portable.project.nodes[0].data, false);
  assert.equal('lastRequest' in portable.project.nodes[0].data, false);
});
