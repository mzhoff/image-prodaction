import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePipelineNodeSettings } from './pipeline-node-settings';
import { createPipelineSettingsSchema } from '../contracts/pipeline-node-tool-schema';

test('Crop accepts bounded spatial settings and rejects invalid rectangles without substituting a full frame', () => {
  const settings = { aspectRatio: '9:16', crop: { x: 0.25, y: 0, width: 0.5, height: 1 } };
  assert.deepEqual(sanitizePipelineNodeSettings('cropImage', settings), settings);
  for (const crop of [{ x: 0.75, y: 0, width: 0.5, height: 1 }, { x: 0, y: 0, width: 0, height: 1 }, { x: 0, y: 0, width: 1, height: NaN }]) {
    assert.throws(() => sanitizePipelineNodeSettings('cropImage', { crop }), /Рамка не изменена/);
  }
  const properties = createPipelineSettingsSchema().properties as Record<string, unknown>;
  assert.ok(properties.crop);
});

test('Crop result asset IDs remain internal and other nodes cannot author a Crop frame', () => {
  const warnings: string[] = [];
  assert.deepEqual(sanitizePipelineNodeSettings('cropImage', { videoResultAssetId: 'forged', videoResultSignature: 'forged' }, 'crop', warnings), {});
  assert.equal(warnings.length, 2);
  assert.deepEqual(sanitizePipelineNodeSettings('generateVideo', { crop: { x: 0, y: 0, width: 1, height: 1 } }), {});
});

test('format-only AI update clears the prior frame and results, including after patch serialization', async () => {
  const { createDefaultNode } = await import('@/entities/production-graph/model/create-default-node');
  const { initialProject } = await import('@/entities/production-graph/model/initial-project');
  const { preparePipelineUpdate, applyPipelineUpdatePatch, pipelineUpdateInputSchema } = await import('./pipeline-update');
  const source = createDefaultNode('cropImage', { x: 0, y: 0 });
  source.data = { ...source.data, aspectRatio: '16:9', crop: { x: 0, y: 0, width: 1, height: 0.5 },
    sourceAssetId: 'old-video', sourceAspectRatio: 16 / 9, cropStateVersion: 3,
    resultAssetId: 'old-image', videoResultAssetId: 'old-crop', videoResultSignature: 'old-signature' };
  const project = { ...initialProject, nodes: [source] };
  const settings = { aspectRatio: '9:16' };
  const prepared = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
    summary: 'Change video format', nodes: [], edges: [], removeEdgeIds: [], updates: [{ nodeId: source.id, settings }],
  }), project);
  assert.deepEqual(prepared.patch.updatedNodes[0]?.settings, settings);
  const updated = applyPipelineUpdatePatch(project, JSON.parse(JSON.stringify(prepared.patch)));
  const data = updated.nodes[0]!.data as unknown as Record<string, unknown>;
  assert.equal(data.aspectRatio, '9:16');
  for (const key of ['crop', 'sourceAssetId', 'sourceAspectRatio', 'cropStateVersion', 'resultAssetId', 'videoResultAssetId', 'videoResultSignature']) {
    assert.equal(Object.hasOwn(data, key), false, key);
  }
  const explicit = { aspectRatio: '9:16', crop: { x: 0.25, y: 0, width: 0.5, height: 1 } };
  const explicitUpdate = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
    summary: 'Change video format and frame', nodes: [], edges: [], removeEdgeIds: [], updates: [{ nodeId: source.id, settings: explicit }],
  }), project);
  const explicitData = applyPipelineUpdatePatch(project, explicitUpdate.patch).nodes[0]!.data as { crop?: unknown; videoResultAssetId?: string };
  assert.deepEqual(explicitData.crop, explicit.crop);
  assert.equal(explicitData.videoResultAssetId, undefined);
  assert.equal((project.nodes[0]!.data as { aspectRatio: string }).aspectRatio, '16:9');
});
