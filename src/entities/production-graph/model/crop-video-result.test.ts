import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { getCropVideoSignature } from './crop-video-result';
import { getNodeVideoAssetId } from './graph-video-io';
import { getNodeImageAssetId } from './graph-image-outputs';
import { canConnectPorts, getNodePorts } from './node-definitions';
import { connectEdgeState } from './graph-connect-edge-state';
import { normalizeProject } from './normalize-project';
import { normalizeNode } from './normalize-project-node';
import { createFavoriteNodeSnapshot, getFavoriteNodeAssetIds } from './favorite-node-preset';
import { createPipelineTemplateExport } from './project-portability';
import { createEmptyProjectUiState } from './project-schema';
import { initialProject } from './initial-project';
import { useProductionGraphStore } from './use-production-graph-store';
import type { CropImageNodeData, CropRect, GraphEdge, ProductionNode, ProductionNodeType } from './types';

function node(type: ProductionNodeType, id: string, data = {}): ProductionNode {
  const base = createDefaultNode(type, { x: 0, y: 0 });
  return { ...base, id, data: { ...base.data, ...data } } as ProductionNode;
}
const crop: CropRect = { x: 0.25, y: 0, width: 0.5, height: 1 };
const source = node('importImage', 'source', { mediaKind: 'video', assetId: 'source-video' });
const frame = node('cropImage', 'crop', { crop, videoResultAssetId: 'cropped-video',
  videoResultSignature: getCropVideoSignature('source-video', crop), resultAssetId: 'legacy-image' });
const input: GraphEdge = { id: 'input', sourceNodeId: 'source', sourcePortId: 'original', targetNodeId: 'crop', targetPortId: 'video' };
const context = { nodes: [source, frame], edges: [input], assets: [] };

test('Crop keeps image ports and adds distinct compatible video input/output', () => {
  assert.deepEqual(getNodePorts(frame).map(({ id, kind, side }) => [id, kind, side]), [
    ['image', 'image', 'input'], ['video', 'video', 'input'],
    ['result', 'image', 'output'], ['videoResult', 'video', 'output'],
  ]);
  const generator = node('generateVideo', 'generator');
  const story = node('reverieStories', 'story');
  assert.equal(canConnectPorts(generator, 'video', frame, 'video'), true);
  assert.equal(canConnectPorts(frame, 'videoResult', story, 'video'), true);
  assert.equal(canConnectPorts(frame, 'videoResult', story, 'image'), false);
  assert.equal(canConnectPorts(node('importImage', 'image'), 'image', frame, 'image'), true);
  assert.equal(getNodeImageAssetId(frame), 'legacy-image');
  assert.equal(getNodeImageAssetId(frame, context), undefined);
});

test('a current Crop result survives normalization and snapshots but never template export', () => {
  const normalized = normalizeNode(frame);
  assert.equal(getNodeVideoAssetId(normalized, 'videoResult', context), 'cropped-video');
  const favorite = createFavoriteNodeSnapshot(frame);
  assert.ok(getFavoriteNodeAssetIds(favorite).includes('cropped-video'));
  assert.equal((favorite.data as CropImageNodeData).videoResultSignature, (frame.data as CropImageNodeData).videoResultSignature);
  const exported = createPipelineTemplateExport({ ...initialProject, ...context }, createEmptyProjectUiState());
  const data = exported.project.nodes.find((item) => item.id === 'crop')!.data as CropImageNodeData;
  assert.equal(data.videoResultAssetId, undefined);
  assert.equal(data.videoResultSignature, undefined);
  assert.deepEqual(data.crop, crop);
});

test('Crop refuses stale, disconnected, missing, ambiguous, malformed and cyclic sources', () => {
  assert.equal(getNodeVideoAssetId(frame, 'videoResult', context), 'cropped-video');
  assert.equal(getNodeVideoAssetId(frame, 'result', context), undefined);
  assert.equal(getNodeVideoAssetId(frame, 'videoResult'), undefined);
  assert.equal(getNodeVideoAssetId(frame, 'videoResult', { ...context, edges: [] }), undefined);
  assert.equal(getNodeVideoAssetId(frame, 'videoResult', { ...context, nodes: [frame] }), undefined);
  assert.equal(getNodeVideoAssetId(frame, 'videoResult', { ...context, nodes: [node('importImage', 'source', { mediaKind: 'video', assetId: 'replacement' }), frame] }), undefined);
  const moved = node('cropImage', 'crop', { ...frame.data, crop: { ...crop, x: 0.1 } });
  assert.equal(getNodeVideoAssetId(moved, 'videoResult', { ...context, nodes: [source, moved] }), undefined);
  const image = node('importImage', 'image', { assetId: 'image-asset' });
  const ambiguous = { ...context, nodes: [...context.nodes, image], edges: [...context.edges,
    { id: 'image', sourceNodeId: 'image', sourcePortId: 'image', targetNodeId: 'crop', targetPortId: 'image' }] };
  assert.equal(getNodeVideoAssetId(frame, 'videoResult', normalizeProject({ ...initialProject, ...ambiguous })), undefined);
  assert.equal(getNodeVideoAssetId(frame, 'videoResult', { nodes: [frame], edges: [{ ...input, sourceNodeId: 'crop', sourcePortId: 'videoResult' }] }), undefined);
  for (const invalid of [{ ...crop, x: NaN }, { ...crop, width: 2 }, { ...crop, height: 0 }]) {
    assert.equal(getCropVideoSignature('source-video', invalid), undefined);
  }
  assert.equal(getCropVideoSignature('source-video'), getCropVideoSignature('source-video', { x: 0, y: 0, width: 1, height: 1 }));
});

test('Crop resolves chained outputs through routers and invalidates the whole chain on source change', () => {
  const router = node('router', 'router');
  const second = node('cropImage', 'second', { crop, videoResultAssetId: 'second-video', videoResultSignature: getCropVideoSignature('cropped-video', crop) });
  const chained = { nodes: [...context.nodes, router, second], edges: [input,
    { id: 'router', sourceNodeId: 'crop', sourcePortId: 'videoResult', targetNodeId: 'router', targetPortId: 'input' },
    { id: 'second', sourceNodeId: 'router', sourcePortId: 'output', targetNodeId: 'second', targetPortId: 'video' }] };
  assert.equal(getNodeVideoAssetId(second, 'videoResult', chained), 'second-video');
  assert.equal(getNodeVideoAssetId(second, 'videoResult', { ...chained, edges: chained.edges.slice(1) }), undefined);
  assert.equal(getNodeVideoAssetId(second, 'videoResult', { ...chained, nodes: chained.nodes.map((item) => item.id === 'crop' ? node('cropImage', 'crop', { ...frame.data, crop: { ...crop, x: 0 } }) : item) }), undefined);
});

test('connecting the other Crop media input replaces its previous source without affecting neighbors', () => {
  const image = node('importImage', 'image', { assetId: 'image-asset' });
  const unrelated = { ...input, id: 'unrelated', targetNodeId: 'other' };
  const replaced = connectEdgeState([...context.nodes, image], [...context.edges, unrelated], {
    sourceNodeId: image.id, sourcePortId: 'image', targetNodeId: frame.id, targetPortId: 'image',
  });
  assert.equal(replaced.edges.length, 2);
  assert.ok(replaced.edges.includes(unrelated));
  assert.equal(replaced.edges.find((edge) => edge.targetNodeId === frame.id)?.targetPortId, 'image');
  assert.equal(getNodeVideoAssetId(frame, 'videoResult', replaced), undefined);
  const reversed = connectEdgeState(replaced.nodes, replaced.edges, {
    sourceNodeId: source.id, sourcePortId: 'original', targetNodeId: frame.id, targetPortId: 'video',
  });
  assert.equal(reversed.edges.filter((edge) => edge.targetNodeId === frame.id).length, 1);
  assert.equal(reversed.edges.find((edge) => edge.targetNodeId === frame.id)?.targetPortId, 'video');
});

test('store disconnect and source replacement invalidate video immediately; undo restores the matching result', () => {
  const image = node('importImage', 'image', { assetId: 'image-asset' });
  useProductionGraphStore.setState({ ...initialProject, ...context, nodes: [...context.nodes, image], historyPast: [], historyFuture: [] });
  const result = () => {
    const state = useProductionGraphStore.getState();
    return getNodeVideoAssetId(state.nodes.find((item) => item.id === frame.id), 'videoResult', state);
  };
  assert.equal(result(), 'cropped-video');
  useProductionGraphStore.getState().deleteEdge(input.id);
  assert.equal(result(), undefined);
  useProductionGraphStore.getState().undo();
  assert.equal(result(), 'cropped-video');
  assert.deepEqual(useProductionGraphStore.getState().connect('image', 'image', 'crop', 'image'), { ok: true });
  assert.equal(result(), undefined);
  useProductionGraphStore.getState().undo();
  assert.equal(result(), 'cropped-video');
});
