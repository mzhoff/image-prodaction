import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { normalizeProject } from '@/entities/production-graph/model/normalize-project';
import type { GenerateImageNodeData } from '@/entities/production-graph/model/types';
import { getRuntimeDescriptor } from '@/modules/executable-pipelines/adapters/studio/studio-runtime-descriptor';
import { createProviderRequest } from '@/modules/generation/server/image-provider-request';
import { getAssistantNodeCatalog } from './node-catalog';
import { parsePipelineBuildInput, preparePipelineBuild } from './pipeline-build';
import { applyPipelineUpdatePatch, pipelineUpdateInputSchema, preparePipelineUpdate } from './pipeline-update';

test('agent settings survive graph persistence, runtime publication and queued provider request', () => {
  const options = { imageQuality: 'max' as const, imageBackground: 'transparent' as const };
  const settings = { model: 'openai/gpt-image-2.5-sunburst', aspectRatio: '16:9', size: 'auto', prompt: 'Poster', ...options };
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Image models', summary: 'Configure image generation without running it.',
    nodes: [{ key: 'image', type: 'generateImage', settings }], edges: [],
  }), structuredClone(initialProject));
  const project = normalizeProject(JSON.parse(JSON.stringify({ ...initialProject, nodes: prepared.patch.nodes })));
  const node = project.nodes[0];
  const data = node.data as GenerateImageNodeData;
  assert.equal(data.model, settings.model);
  assert.equal(data.imageQuality, 'max');
  assert.equal(data.imageBackground, 'transparent');
  assert.equal(data.size, 'auto');
  const descriptor = getRuntimeDescriptor(node, { edges: [], incomingByNode: new Map(), nodeById: new Map([[node.id, node]]) });
  assert.equal(descriptor.handlerType, 'ai.image.generate');
  assert.deepEqual(descriptor.config, settings);
  const provider = createProviderRequest({
    ...settings, inputs: { actors: [], actions: [], composition: [], camera: [], background: [], style: [], light: [], color: [], metaphor: [], text: [] },
    documentId: 'doc', workspaceId: 'workspace', locationInputs: [], subjectInputs: [], referenceImages: [],
  });
  assert.deepEqual(provider.parameters.image, { ...options, api: 'images', aspectRatio: '16:9', size: 'auto' });
});

test('node catalog exposes image-specific parameters and boundaries without changing image ports', () => {
  const node = getAssistantNodeCatalog('generateImage')[0];
  for (const field of ['model', 'imageQuality', 'imageBackground', 'imageFormat', 'imageCompression', 'imageSeed']) {
    assert.ok(node.configurableFields.includes(field));
  }
  assert.match(node.capabilities.join(' '), /Flare\/Sunburst/);
  assert.match(node.limitations.join(' '), /SVG/);
  assert.ok(node.ports.some((port) => port.id === 'image' && port.kind === 'image' && port.side === 'output'));
});

test('serialized model changes remove previous model options while preserving explicit new options', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Image options', summary: 'Configure an image node.',
    nodes: [{ key: 'image', type: 'generateImage', settings: { model: 'openai/gpt-image-2.5-flare', size: 'auto', imageQuality: 'max', imageBackground: 'transparent' } }], edges: [],
  }), structuredClone(initialProject));
  const project = { ...structuredClone(initialProject), nodes: prepared.patch.nodes };
  const update = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
    summary: 'Switch image model.', updates: [{ nodeId: project.nodes[0].id,
      settings: { model: 'black-forest-labs/flux.2-pro', size: 'auto', imageSeed: 73 } }],
  }), project);
  const next = applyPipelineUpdatePatch(project, JSON.parse(JSON.stringify(update.patch))).nodes[0].data as GenerateImageNodeData;
  assert.equal(next.imageQuality, undefined);
  assert.equal(next.imageBackground, undefined);
  assert.equal(next.imageSeed, 73);
});
