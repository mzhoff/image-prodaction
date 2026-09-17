import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { getRuntimeDescriptor } from './studio-runtime-descriptor';
import { compileStudioSection } from './studio-pipeline-compiler';
import { buildPipelineVideoRequest } from '../../server/pipeline-video-generation-handler';
import { videoSettingsSchema } from '@/shared/media/video-generation-contracts';
import { isProductionPipelineHandlerSupported, PRODUCTION_PIPELINE_NODE_MANIFEST } from '../../server/pipeline-production-manifest';
import { inferPipelineOutputKind } from '../../server/pipeline-catalog-mapping';
import { hasProviderCalls } from '../../server/runtime-cost-estimator';

test('video node compiles to an immutable server handler with video output', () => {
  const node = createDefaultNode('generateVideo', { x: 20, y: 20 });
  node.data = { ...node.data, prompt: 'A reusable fragment.' };
  const section = { id: 'video-section', title: 'Video', position: { x: 0, y: 0 }, size: { width: 1000, height: 1500 } };
  const prompt = createDefaultNode('textPrompt', { x: 450, y: 20 });
  const project = { ...structuredClone(initialProject), nodes: [prompt, node], sections: [section], edges: [
    { id: 'edge', sourceNodeId: prompt.id, sourcePortId: 'text', targetNodeId: node.id, targetPortId: 'prompt' },
  ] };
  const compiled = compileStudioSection(project, section.id, { isHandlerSupported: isProductionPipelineHandlerSupported });
  assert.equal(compiled.sourceMetadata.outputs[0].kind, 'video');
  assert.equal(inferPipelineOutputKind(compiled.compiledPlan, node.id, 'video'), 'video');
  assert.equal(hasProviderCalls(compiled.compiledPlan), true);
  assert.equal(PRODUCTION_PIPELINE_NODE_MANIFEST.find((item) => item.handlerType === 'ai.video.generate')?.paid, true);
  const descriptor = getRuntimeDescriptor(node, { edges: [], incomingByNode: new Map(), nodeById: new Map([[node.id, node]]) });
  assert.equal(descriptor.handlerType, 'ai.video.generate');
  assert.equal(descriptor.config.mode, 'text');
  assert.ok(!('videoRequest' in descriptor.config));
});
test('runtime video preserves first/last identity and per-reference captions, rejects duplicate inputs', () => {
  const node = createDefaultNode('generateVideo', { x: 0, y: 0 });
  const config = { ...videoSettingsSchema.parse(node.data), mode: 'references', referenceDescriptions: ['unused', 'hero', 'light'] };
  const artifact = { kind: 'image' as const, assetId: '019f1e15-0185-7000-8000-000000000001' };
  const request = buildPipelineVideoRequest({ nodeId: node.id, config, inputs: { 'reference-2': artifact, 'reference-3': artifact, prompt: 'Move' } });
  assert.deepEqual(request.references.map((image) => [image.slot, image.description]), [[2, 'hero'], [3, 'light']]);
  assert.equal(request.prompt, 'Move');
  assert.throws(() => buildPipelineVideoRequest({ nodeId: node.id, config, inputs: { 'reference-2.0': artifact, 'reference-2.1': artifact } }), /exactly one/);
});

test('runtime expands a gallery into reference slots and refuses overflow, collisions and multi-image keyframes', () => {
  const node = createDefaultNode('generateVideo', { x: 0, y: 0 });
  const config = { ...videoSettingsSchema.parse(node.data), mode: 'references', referenceDescriptions: ['first', 'second', 'third'] };
  const frames = [1, 2, 3].map((id) => ({ kind: 'image' as const, assetId: `019f1e15-0185-7000-8000-00000000000${id}` }));
  const request = buildPipelineVideoRequest({ nodeId: node.id, config, inputs: { 'reference-1': frames } });
  assert.deepEqual(request.references.map((ref) => [ref.slot, ref.description]), [[1, 'first'], [2, 'second'], [3, 'third']]);
  assert.throws(() => buildPipelineVideoRequest({ nodeId: node.id, config, inputs: { 'reference-1': [...frames, frames[0]!] } }), /не больше 3/);
  assert.throws(() => buildPipelineVideoRequest({ nodeId: node.id, config, inputs: { 'reference-1': frames.slice(0, 2), 'reference-2': frames[2]! } }), /пересекающиеся/);
  assert.throws(() => buildPipelineVideoRequest({ nodeId: node.id, config: { ...config, mode: 'frames' }, inputs: { 'first-frame': frames } }), /exactly one image/);
});
