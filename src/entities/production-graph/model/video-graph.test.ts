import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { getNodePorts, canConnectPorts } from './node-definitions';
import { getNodeAudioAssetId } from './graph-audio-io';
import { getImportVideoPreviewAssetId, getNodeVideoAssetId } from './graph-video-io';
import { getNodeImageAssetId } from './graph-image-outputs';
import { assignImportMedia } from './import-media-assignment';
import { normalizeNode } from './normalize-project-node';
import { createAssetManifest, createEmptyProjectUiState } from './project-schema';
import { createPipelineTemplateExport } from './project-portability';
import { initialProject } from './initial-project';
import { createFavoriteNodeSnapshot, getFavoriteNodeAssetIds } from './favorite-node-preset';
import type { AssetRecord, ImportImageNodeData, ProductionNode } from './types';

const video: AssetRecord = { id: 'video', kind: 'video', name: 'Interview.mp4', mimeType: 'video/mp4',
  createdAt: '2026-09-06T00:00:00Z', storage: { type: 'remote', assetId: 'video' },
  video: { container: 'mp4', codec: 'h264', contentType: 'video/mp4', durationSeconds: 10, width: 640, height: 360,
    frameRate: 25, rotationDegrees: 0, browserPlayable: true, audioTracks: [
      { index: 1, codec: 'aac', channels: 2, sampleRateHz: 48000, isDefault: false },
      { index: 2, codec: 'aac', channels: 2, sampleRateHz: 48000, isDefault: true },
    ] },
};
function imported(overrides: Partial<ImportImageNodeData> = {}): ProductionNode {
  return { ...createDefaultNode('importImage', { x: 0, y: 0 }), id: 'import', data: {
    title: 'Import', mediaKind: 'video', assetId: 'video', videoAudioTrackIndex: 2,
    videoAudioAssetId: 'audio', videoOnlyAssetId: 'muted', videoDerivedSourceAssetId: 'video',
    videoDerivedAudioTrackIndex: 2, ...overrides,
  } };
}
test('video Import exposes original/video/audio with no legacy image connector', () => {
  assert.deepEqual(getNodePorts(imported()).map(({ id, kind }) => ({ id, kind })), [
    { id: 'original', kind: 'video' }, { id: 'video', kind: 'video' }, { id: 'audio', kind: 'audio' },
  ]);
  assert.equal(getNodeImageAssetId(imported()), undefined);
  const stt = createDefaultNode('speechToText', { x: 0, y: 0 });
  assert.equal(canConnectPorts(imported(), 'audio', stt, 'audio'), true);
  assert.equal(canConnectPorts(imported(), 'original', stt, 'audio'), false);
  assert.equal((normalizeNode(imported()).data as ImportImageNodeData).mediaKind, 'video');
});
test('derived outputs are invalidated by source and audio track changes', () => {
  assert.equal(getNodeVideoAssetId(imported()), 'video');
  assert.equal(getNodeVideoAssetId(imported(), 'video'), 'muted');
  assert.equal(getNodeAudioAssetId(imported()), 'audio');
  assert.equal(getNodeAudioAssetId(imported({ videoAudioTrackIndex: 1 })), undefined);
  assert.equal(getNodeVideoAssetId(imported({ assetId: 'replacement' }), 'video'), undefined);
  assert.equal(getNodeAudioAssetId(imported({ assetId: 'replacement' })), undefined);
});
test('implicit default track resolves exactly like Studio and runtime without a saved explicit selection', () => {
  const source = imported({ videoAudioTrackIndex: undefined });
  const context = { nodes: [source], edges: [], assets: [video] };
  assert.equal(getNodeAudioAssetId(source, context), 'audio');
  assert.equal(getNodeAudioAssetId(source), 'audio');
  assert.equal(getNodeAudioAssetId(imported({ videoAudioTrackIndex: undefined, videoDerivedAudioTrackIndex: 1 }), context), undefined);
  const silent = { ...video, video: { ...video.video!, audioTracks: [] } };
  assert.equal(getNodeAudioAssetId(source, { ...context, assets: [silent] }), undefined);
});
test('browser preview identity matches both original source and selected audio stream after non-UI edits', () => {
  const data = imported({ videoPreviewAssetId: 'browser-preview', videoPreviewAudioTrackIndex: 2 }).data as ImportImageNodeData;
  assert.equal(getImportVideoPreviewAssetId(data, 2), 'browser-preview');
  assert.equal(getImportVideoPreviewAssetId(data, 1), undefined);
  assert.equal(getImportVideoPreviewAssetId(data), undefined);
  assert.equal(getImportVideoPreviewAssetId({ ...data, assetId: 'replaced' }, 2), undefined);
  assert.equal(getImportVideoPreviewAssetId({ ...data, mediaKind: 'image' }, 2), undefined);
  assert.equal(getImportVideoPreviewAssetId({ ...data, videoPreviewAudioTrackIndex: undefined }), 'browser-preview');
});
test('preview stream identity is bounded, survives same-file snapshots, and is cleared for new media/templates', () => {
  const source = imported({ videoPreviewAssetId: 'browser-preview', videoPreviewAudioTrackIndex: 2 });
  assert.equal((normalizeNode(source).data as ImportImageNodeData).videoPreviewAudioTrackIndex, 2);
  for (const value of [-1, 32, 1.5, '2', null]) {
    const invalid = imported({ videoPreviewAudioTrackIndex: value as never });
    assert.equal((normalizeNode(invalid).data as ImportImageNodeData).videoPreviewAudioTrackIndex, undefined);
  }
  const reassigned = assignImportMedia([source], [], 'import', video).nodes[0]!.data as ImportImageNodeData;
  assert.equal(reassigned.videoPreviewAssetId, undefined);
  assert.equal(reassigned.videoPreviewAudioTrackIndex, undefined);
  assert.equal((createFavoriteNodeSnapshot(source).data as ImportImageNodeData).videoPreviewAudioTrackIndex, 2);
  const template = createPipelineTemplateExport({ ...initialProject, nodes: [source], assets: [video] }, createEmptyProjectUiState());
  assert.equal(Object.hasOwn(template.project.nodes[0]!.data, 'videoPreviewAudioTrackIndex'), false);
  assert.equal(Object.hasOwn(template.project.nodes[0]!.data, 'videoPreviewAssetId'), false);
});
test('video assignment chooses the default track and clears prior derivations and incompatible image links', () => {
  const source = { ...createDefaultNode('importImage', { x: 0, y: 0 }), id: 'import' };
  const target = { ...createDefaultNode('imageToText', { x: 300, y: 0 }), id: 'extract' };
  const result = assignImportMedia([source, target], [{ id: 'old', sourceNodeId: 'import', sourcePortId: 'image', targetNodeId: 'extract', targetPortId: 'image' }], 'import', video);
  const data = result.nodes[0]!.data as ImportImageNodeData;
  assert.equal(data.mediaKind, 'video');
  assert.equal(data.videoAudioTrackIndex, 2);
  assert.equal(data.videoOnlyAssetId, undefined);
  assert.deepEqual(result.edges, []);
});
test('routers preserve the selected video output and do not falsely mark an unprepared file as ready', () => {
  const source = imported({ videoOnlyAssetId: undefined });
  const router = { ...createDefaultNode('router', { x: 400, y: 0 }), id: 'router' };
  const edges = [{ id: 'to-router', sourceNodeId: 'import', sourcePortId: 'video', targetNodeId: 'router', targetPortId: 'input' },
    { id: 'from-router', sourceNodeId: 'router', sourcePortId: 'output', targetNodeId: 'output', targetPortId: 'field:video' }];
  const context = { nodes: [source, router], edges };
  assert.equal(getNodeVideoAssetId(router, 'output', context), undefined);
  edges[0]!.sourcePortId = 'original';
  assert.equal(getNodeVideoAssetId(router, 'output', context), 'video');
  assert.equal(getNodeAudioAssetId(router, context), undefined);
  edges[0]!.sourcePortId = 'audio';
  assert.equal(getNodeAudioAssetId(router, context), 'audio');
});
test('snapshots preserve video metadata and references; portable templates drop source-specific outputs', () => {
  assert.deepEqual(createAssetManifest([video])[0]?.video, video.video);
  const snapshot = createFavoriteNodeSnapshot(imported());
  assert.deepEqual(new Set(getFavoriteNodeAssetIds(snapshot)), new Set(['video', 'audio', 'muted']));
  const template = createPipelineTemplateExport({ ...initialProject, nodes: [imported()], assets: [video] }, createEmptyProjectUiState());
  const data = template.project.nodes[0]!.data as ImportImageNodeData;
  assert.equal(data.mediaKind, 'video');
  for (const key of ['assetId', 'videoOnlyAssetId', 'videoAudioAssetId', 'videoDerivedSourceAssetId', 'videoAudioTrackIndex']) {
    assert.equal(Object.hasOwn(data, key), false);
  }
});
