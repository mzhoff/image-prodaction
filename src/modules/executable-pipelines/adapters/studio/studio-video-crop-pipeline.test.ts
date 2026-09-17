import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import type { GraphProject, ProductionNode } from '@/entities/production-graph/model/types';
import { requireProductionStoryDocument } from '@/shared/contracts/stories-document';
import { compileStudioSection } from './studio-pipeline-compiler';
import { getVideoCropRuntimeDescriptor } from './studio-video-crop-descriptor';
import { groupEdges } from './studio-graph-resolution';
import { executeCompiledPipeline } from '../../core/pipeline-executor';
import { createVideoPipelineHandlers } from '../../server/pipeline-video-handlers';
import { createStoriesHandler } from '../../server/pipeline-stories-handler';
import { isProductionPipelineHandlerSupported, PRODUCTION_PIPELINE_NODE_MANIFEST } from '../../server/pipeline-production-manifest';
import { inferPipelineOutputKind } from '../../server/pipeline-catalog-mapping';
import type { StoryStoredAsset } from '../../server/pipeline-stories-assets';

const sourceId = '019ed347-66a4-7124-8000-000000000001';
const posterId = '019ed347-66a4-7124-8000-000000000002';
const resultId = '019ed347-66a4-7124-8000-000000000003';
const crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
const context = { workspaceId: 'workspace', runId: '019ed347-66a4-7124-8000-000000000004', pipelineId: 'test', pipelineVersion: 1, sourceApplication: 'test' };
const poster: StoryStoredAsset = { id: posterId, workspaceId: context.workspaceId, status: 'ready', mediaKind: 'image',
  contentType: 'image/webp', byteSize: 1000, width: 1080, height: 1920, checksumSha256: 'a'.repeat(64), metadata: null };
const resultVideo: StoryStoredAsset = { ...poster, id: resultId, mediaKind: 'video', contentType: 'video/mp4', byteSize: 2000,
  metadata: { video: { container: 'mp4', codec: 'h264', contentType: 'video/mp4', durationSeconds: 4, width: 1080, height: 1920,
    frameRate: 30, rotationDegrees: 0, audioTracks: [], browserPlayable: true } } };

for (const sourceKind of ['importImage', 'generateVideo'] as const) test(`${sourceKind} → Crop → Stories executes the new source through a server crop`, async () => {
  const graph = project(sourceKind);
  const plan = compileStudioSection(graph, 'section', { isHandlerSupported: isProductionPipelineHandlerSupported }).compiledPlan;
  const operation = plan.definition.nodes.find((entry) => entry.id === 'crop')!;
  assert.equal(operation.handlerType, 'video.crop');
  assert.deepEqual(operation.config, { aspectRatio: '9:16', crop });
  assert.deepEqual(operation.inputs.video, { source: 'node-output', nodeId: 'source', outputKey: sourceKind === 'importImage' ? 'original' : 'video' });
  assert.deepEqual(plan.definition.nodes.find((entry) => entry.id === 'stories')!.inputs.video,
    { source: 'node-output', nodeId: 'crop', outputKey: 'videoResult' });
  assert.equal(inferPipelineOutputKind(plan, 'crop', 'videoResult'), 'video');
  assert.equal(JSON.stringify(plan).includes('stale-cached'), false);
  let crops = 0;
  const handlers = [
    ...createVideoPipelineHandlers({ async resolveVideo() { return { kind: 'video', assetId: sourceId }; },
      async deriveVideo(request) { assert.equal(request.kind, 'crop'); assert.equal(request.artifact.assetId, sourceId);
        assert.deepEqual(request.crop, crop); assert.equal(request.aspectRatio, '9:16'); crops++;
        return { kind: 'video', assetId: resultId, checksumSha256: resultVideo.checksumSha256 }; },
    }),
    { handlerType: 'ai.video.generate', handlerVersion: '1', async execute() { return { video: { kind: 'video', assetId: sourceId } }; } },
    { handlerType: 'asset.reference', handlerVersion: '1', async execute() { return { asset: { kind: 'image', assetId: posterId } }; } },
    createStoriesHandler(async (workspaceId, ids) => { assert.equal(workspaceId, context.workspaceId); return [poster, resultVideo].filter((row) => ids.includes(row.id)); }),
  ];
  const result = await executeCompiledPipeline({ plan, inputs: {}, context, signal: new AbortController().signal,
    handlers: { resolve(type, version) { return handlers.find((item) => item.handlerType === type && item.handlerVersion === version) ?? null; } } });
  assert.equal(crops, 1);
  const story = requireProductionStoryDocument(result.outputs.story);
  assert.equal(story.slides[0].background.asset.assetId, resultId);
  assert.equal(story.slides[0].background.asset.kind, 'video');
  assert.equal(story.slides[0].advance.mode, 'mediaEnd');
});

test('Crop rejects image-only, mixed, wrong typed and invalid bounds distinctly without enabling legacy image runtime', () => {
  const graph = project('importImage');
  const cropNode = graph.nodes.find((entry) => entry.id === 'crop')!;
  const descriptor = () => getVideoCropRuntimeDescriptor(cropNode, { edges: graph.edges, incomingByNode: groupEdges(graph.edges, 'targetNodeId'), nodeById: new Map(graph.nodes.map((entry) => [entry.id, entry])) });
  const incoming = graph.edges.find((edge) => edge.targetNodeId === 'crop')!;
  incoming.targetPortId = 'image';
  assert.throws(descriptor, /изображений пока работает только в Studio/);
  graph.edges.push(edge('source', 'original', 'crop', 'video'));
  assert.throws(descriptor, /одновременно/);
  graph.edges.pop(); incoming.targetPortId = 'video'; incoming.sourceNodeId = 'poster'; incoming.sourcePortId = 'image';
  assert.throws(descriptor, /должен получать видео/);
  incoming.sourceNodeId = 'source'; incoming.sourcePortId = 'original';
  cropNode.data = { ...cropNode.data, crop: { ...crop, width: 2 } } as typeof cropNode.data;
  assert.throws(descriptor, /корректную рамку/);
});

test('aspect-only Crop compiles, and implicit Crop leaf exposes the video output', () => {
  const graph = project('generateVideo');
  const cropNode = graph.nodes.find((entry) => entry.id === 'crop')!;
  cropNode.data = { title: 'Crop', aspectRatio: '9:16', locked: false };
  assert.deepEqual(compileStudioSection(graph, 'section').compiledPlan.definition.nodes.find((entry) => entry.id === 'crop')!.config, { aspectRatio: '9:16' });
  const prompt = node('prompt', 'textPrompt');
  graph.nodes = [prompt, graph.nodes.find((entry) => entry.id === 'source')!, cropNode];
  graph.edges = [edge('prompt', 'text', 'source', 'prompt'), edge('source', 'video', 'crop', 'video')];
  const plan = compileStudioSection(graph, 'section');
  assert.equal(plan.sourceMetadata.outputs[0].kind, 'video');
  assert.equal(plan.sourceMetadata.outputs[0].portId, 'videoResult');
  assert.equal(PRODUCTION_PIPELINE_NODE_MANIFEST.find((entry) => entry.handlerType === 'video.crop')?.paid, false);
});

function project(sourceKind: 'importImage' | 'generateVideo'): GraphProject {
  return { ...structuredClone(initialProject), nodes: [
    node('input', 'pipelineInput', { fields: [{ id: 'note', key: 'note', kind: 'text', required: false }] }),
    node('source', sourceKind, sourceKind === 'importImage' ? { assetId: sourceId, mediaKind: 'video' } : { prompt: 'Move gently' }),
    node('crop', 'cropImage', { aspectRatio: '9:16', crop, resultAssetId: 'stale-cached-image', videoResultAssetId: 'stale-cached-video' }),
    node('poster', 'importImage', { assetId: posterId, mediaKind: 'image' }),
    node('stories', 'reverieStories', { storyTitle: 'История' }),
  ], edges: [edge('source', sourceKind === 'importImage' ? 'original' : 'video', 'crop', 'video'),
    edge('crop', 'videoResult', 'stories', 'video'), edge('poster', 'image', 'stories', 'poster')],
  sections: [{ id: 'section', title: 'Stories', position: { x: 0, y: 0 }, size: { width: 2000, height: 2000 } }], assets: [] };
}
function node(id: string, type: ProductionNode['type'], data: Record<string, unknown> = {}): ProductionNode {
  const original = createDefaultNode(type, { x: 100, y: 100 });
  return { ...original, id, data: { ...original.data, ...data } } as ProductionNode;
}
function edge(sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) {
  return { id: `${sourceNodeId}-${targetNodeId}-${targetPortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId };
}
