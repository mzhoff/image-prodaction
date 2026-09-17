import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TIMELINE_MODEL } from '@/shared/api/timeline-models';
import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { createDefaultNode } from './create-default-node';
import { timelineClipSignature } from '@/shared/media/timeline-output';
import { getNodeVideoAssetId } from './graph-video-io';
import { getNodeImageOutputAssetIds } from './graph-image-outputs';
import { getNodeTextResult } from './graph-text-outputs';
import { collectVideoRequest } from './video-generation-inputs';
import { getNodeTimelineResult } from './graph-timeline-io';
import { canConnectPorts, getNodePorts, isNodeCollapsible } from './node-definitions';
import { normalizeNode } from './normalize-project-node';
import { createFavoriteNodeSnapshot } from './favorite-node-preset';
import { createPipelineTemplateExport, createProjectSnapshotExport } from './project-portability';
import { createEmptyProjectUiState } from './project-schema';
import { clearCopiedNodeExecution } from './speech-request';
import type { AssetRecord, GenerateVideoNodeData, GraphProject, TimelineHandoffNodeData } from './types';

const sourceAssetId = 'bbbbbbbb-1111-4111-8111-111111111111';
const frameAssetId = 'aaaaaaaa-1111-4111-8111-111111111111';
const analysis: TimelineAnalysis = {
  version: 1, sourceAssetId, sourceChecksum: 'a'.repeat(64), durationMs: 1000,
  frameTimesMs: [0, 250, 500, 750],
  shots: [
    { id: 'shot-1', startMs: 0, endMs: 500, frames: [{ timeMs: 250, assetId: frameAssetId }], description: 'First' },
    { id: 'shot-2', startMs: 500, endMs: 1000, frames: [{ timeMs: 750 }], description: 'Second' },
  ],
};

function fixture() {
  const source = createDefaultNode('importImage', { x: 0, y: 0 });
  source.data = { title: 'Video', mediaKind: 'video', assetId: sourceAssetId };
  const timeline = createDefaultNode('timelineHandoff', { x: 500, y: 0 });
  timeline.data = { ...timeline.data, analysis } as TimelineHandoffNodeData;
  const edges = [{ id: 'source-to-timeline', sourceNodeId: source.id, sourcePortId: 'original', targetNodeId: timeline.id, targetPortId: 'video' }];
  return { source, timeline, edges, context: { nodes: [source, timeline], edges } };
}

test('Timeline Handoff has real video/json ports, safe defaults and standard collapsing', () => {
  const { source, timeline } = fixture();
  assert.equal(isNodeCollapsible(timeline.type), true);
  assert.equal((timeline.data as TimelineHandoffNodeData).model, DEFAULT_TIMELINE_MODEL);
  assert.deepEqual(getNodePorts(timeline).map(({ id, kind, side }) => ({ id, kind, side })), [
    { id: 'video', kind: 'video', side: 'input' }, { id: 'timeline', kind: 'json', side: 'output' },
    { id: 'videoResult', kind: 'video', side: 'output' }, { id: 'frames', kind: 'image', side: 'output' },
    { id: 'descriptions', kind: 'text', side: 'output' },
  ]);
  assert.equal(canConnectPorts(source, 'original', timeline, 'video'), true);
  assert.equal(canConnectPorts(source, 'audio', timeline, 'video'), false);
  const output = createDefaultNode('pipelineOutput', { x: 1000, y: 0 });
  output.data = { title: 'Result', fields: [{ id: 'storyboard', key: 'storyboard', kind: 'json', required: true }] };
  assert.equal(canConnectPorts(timeline, 'timeline', output, 'field:storyboard'), true);
});

test('timeline output is the complete document and never depends on the viewed shot or mode', () => {
  const { timeline, context } = fixture();
  const before = getNodeTimelineResult(timeline, context);
  timeline.data = { ...timeline.data, activeShotIndex: 1, previewMode: 'image' } as TimelineHandoffNodeData;
  assert.deepEqual(getNodeTimelineResult(timeline, context), before);
  assert.equal(before?.shots.length, 2);
  assert.equal(before?.frames[0]?.asset?.assetId, frameAssetId);
  assert.equal('frameTimesMs' in (before ?? {}), false);
});

test('timeline output fails closed after replacing or disconnecting the video', () => {
  const { source, timeline, context } = fixture();
  source.data = { ...source.data, assetId: frameAssetId };
  assert.equal(getNodeTimelineResult(timeline, context), undefined);
  assert.equal(getNodeTimelineResult(timeline, { nodes: context.nodes, edges: [] }), undefined);
  assert.equal(getNodeTimelineResult(source), undefined);
});

test('same-document normalization preserves durable request but copies never resume its job', () => {
  const { timeline } = fixture();
  const request: NonNullable<TimelineHandoffNodeData['request']> = {
    idempotencyKey: 'review-request', fingerprint: '{"source":"test"}', action: 'describe',
    jobId: '019ed347-66a4-7124-8000-000000000001', sourceAssetId,
    workspaceId: 'aaaaaaaa-2222-4222-8222-222222222222', documentId: 'aaaaaaaa-3333-4333-8333-333333333333',
    shotBaselines: [{ id: 'shot-1', description: 'First', fingerprint: 'reviewed' }],
  };
  timeline.data = { ...timeline.data, request } as TimelineHandoffNodeData;
  assert.deepEqual((normalizeNode(timeline).data as TimelineHandoffNodeData).request, request);
  const copy = clearCopiedNodeExecution(timeline);
  assert.equal((copy.data as TimelineHandoffNodeData).request, undefined);
  assert.deepEqual((copy.data as TimelineHandoffNodeData).analysis, analysis);
  assert.deepEqual((timeline.data as TimelineHandoffNodeData).request, request);
});

test('timeline normalization validates schema, clamps UI position and rejects arbitrary models', () => {
  const { timeline } = fixture();
  const normalized = normalizeNode({ ...timeline, data: {
    ...timeline.data, model: 'untrusted/model', language: 'system', threshold: 500,
    activeShotIndex: 99, previewMode: 'image',
  } as TimelineHandoffNodeData });
  const data = normalized.data as TimelineHandoffNodeData;
  assert.equal(data.model, DEFAULT_TIMELINE_MODEL);
  assert.equal(data.language, undefined);
  assert.equal(data.threshold, 60);
  assert.equal(data.activeShotIndex, 1);
  assert.equal(data.previewMode, 'image');
  const corrupt = normalizeNode({ ...timeline, data: { ...timeline.data, analysis: { ...analysis, durationMs: 0 } } as TimelineHandoffNodeData });
  assert.equal((corrupt.data as TimelineHandoffNodeData).analysis, undefined);
});

test('favorite settings do not copy private analysis, frames or durable request state', () => {
  const { timeline } = fixture();
  const snapshot = createFavoriteNodeSnapshot(timeline);
  assert.equal((snapshot.data as TimelineHandoffNodeData).threshold, 10);
  assert.equal((snapshot.data as TimelineHandoffNodeData).analysis, undefined);
  assert.equal((snapshot.data as TimelineHandoffNodeData).request, undefined);
});

test('project snapshots preserve timeline references but pipeline templates contain only configuration', () => {
  const { source, timeline, edges } = fixture();
  const project: GraphProject = { version: 1, nodes: [source, timeline], edges, assets: [], sections: [], presets: [], subjects: [], locations: [], publications: [], runs: [], selectedNodeIds: [], selectedSectionIds: [] };
  const ui = createEmptyProjectUiState();
  const full = createProjectSnapshotExport(project, ui);
  assert.deepEqual((full.project.nodes[1]!.data as TimelineHandoffNodeData).analysis, analysis);
  const portable = createPipelineTemplateExport(project, ui);
  const exported = portable.project.nodes.find((node) => node.type === 'timelineHandoff')!.data as TimelineHandoffNodeData;
  assert.equal(exported.analysis, undefined);
  assert.equal(exported.request, undefined);
  assert.equal(exported.threshold, 10);
});

test('typed outputs select one shot or the whole ordered series while JSON always stays complete', () => {
  const { timeline, context } = fixture();
  const secondId = 'cccccccc-1111-4111-8111-111111111111';
  const complete = structuredClone(analysis); complete.shots[1]!.frames[0]!.assetId = secondId;
  timeline.data = { ...timeline.data, analysis: complete, outputScope: 'selected', activeShotIndex: 0,
    videoResultAssetId: 'dddddddd-1111-4111-8111-111111111111', videoResultSignature: timelineClipSignature(complete, complete.shots[0]!),
  } as TimelineHandoffNodeData;
  const graph = { ...context, assets: [] };
  assert.deepEqual(getNodeImageOutputAssetIds(timeline, graph), [frameAssetId]);
  assert.equal(getNodeTextResult(timeline, 'descriptions', graph), 'First');
  assert.equal(getNodeVideoAssetId(timeline, 'videoResult', graph), 'dddddddd-1111-4111-8111-111111111111');
  timeline.data = { ...timeline.data, activeShotIndex: 1 } as TimelineHandoffNodeData;
  assert.deepEqual(getNodeImageOutputAssetIds(timeline, graph), [secondId]);
  assert.equal(getNodeTextResult(timeline, 'descriptions', graph), 'Second');
  assert.equal(getNodeVideoAssetId(timeline, 'videoResult', graph), undefined);
  timeline.data = { ...timeline.data, outputScope: 'all' } as TimelineHandoffNodeData;
  assert.deepEqual(getNodeImageOutputAssetIds(timeline, graph), [frameAssetId, secondId]);
  assert.equal(getNodeTextResult(timeline, 'descriptions', graph), 'First\n\nSecond');
  assert.equal(getNodeVideoAssetId(timeline, 'videoResult', graph), sourceAssetId);
  assert.equal(getNodeTimelineResult(timeline, graph)?.shots.length, 2);
  assert.deepEqual(getNodeImageOutputAssetIds(timeline, { ...graph, edges: [] }), []);
  assert.equal(getNodeTextResult(timeline, 'descriptions', { ...graph, edges: [] }), '');
  assert.equal(getNodeVideoAssetId(timeline, 'videoResult', { ...graph, edges: [] }), undefined);
});

test('one Timeline gallery wire expands references and never sends partially prepared or excessive frames', () => {
  const { source, timeline, edges } = fixture();
  const video = createDefaultNode('generateVideo', { x: 900, y: 0 });
  video.data = { ...video.data, mode: 'references', model: 'openai/sora-2-pro', referenceDescriptions: ['first', 'second', 'third'] } as GenerateVideoNodeData;
  const ids = [frameAssetId, 'bbbbbbbb-2222-4222-8222-222222222222', 'bbbbbbbb-3333-4333-8333-333333333333'];
  const prepared = structuredClone(analysis);
  prepared.frameTimesMs = [0, 125, 250, 500, 750];
  prepared.shots[0]!.frames = [0, 125, 250].map((timeMs, index) => ({ timeMs, assetId: ids[index]! }));
  timeline.data = { ...timeline.data, analysis: prepared } as TimelineHandoffNodeData;
  const assets: AssetRecord[] = ids.map((id) => ({ id, kind: 'image', name: 'Frame', mimeType: 'image/jpeg', createdAt: '2026-09-12T00:00:00Z', storage: { type: 'remote', assetId: id } }));
  const graph = { nodes: [source, timeline, video], assets, edges: [...edges, { id: 'gallery', sourceNodeId: timeline.id, sourcePortId: 'frames', targetNodeId: video.id, targetPortId: 'reference-1' }] };
  assert.deepEqual(collectVideoRequest(video.id, video.data as GenerateVideoNodeData, graph).references.map((ref) => [ref.slot, ref.assetId, ref.description]), ids.map((id, index) => [index + 1, id, ['first', 'second', 'third'][index]]));
  assert.throws(() => collectVideoRequest(video.id, video.data as GenerateVideoNodeData, { ...graph, assets: assets.slice(1) }), /ещё не готовы/);
  const keyframeGraph = { ...graph, assets: assets.slice(0, 1), edges: graph.edges.map((edge) => edge.id === 'gallery' ? { ...edge, targetPortId: 'first-frame' } : edge) };
  assert.throws(() => collectVideoRequest(video.id, { ...video.data, mode: 'frames' } as GenerateVideoNodeData, keyframeGraph), /нескольких кадров/);
  prepared.shots[1]!.frames[0]!.assetId = 'bbbbbbbb-4444-4444-8444-444444444444';
  timeline.data = { ...timeline.data, analysis: structuredClone(prepared), outputScope: 'all' } as TimelineHandoffNodeData;
  graph.assets.push({ ...assets[0]!, id: prepared.shots[1]!.frames[0]!.assetId! });
  assert.throws(() => collectVideoRequest(video.id, video.data as GenerateVideoNodeData, graph), /не больше 3/);
  timeline.data = { ...timeline.data, analysis, outputScope: 'all' } as TimelineHandoffNodeData;
  assert.deepEqual(getNodeImageOutputAssetIds(timeline, graph), []);
});
