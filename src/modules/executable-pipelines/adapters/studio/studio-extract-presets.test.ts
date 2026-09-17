import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { buildExtractPrompt } from '@/entities/production-graph/model/extract-presets';
import type { ImageToTextNodeData, PipelineInputNodeData, PipelineOutputNodeData } from '@/entities/production-graph/model/types';
import { getRuntimeDescriptor } from './studio-runtime-descriptor';
import { compileStudioSection } from './studio-pipeline-compiler';

test('Extract descriptor preserves a custom prompt and pins profile-specific Layers', () => {
  const node = createDefaultNode('imageToText', { x: 0, y: 0 });
  node.data = { ...node.data, analysisPreset: 'graphics', presets: ['typography'], prompt: 'Authored rules.' } as ImageToTextNodeData;
  const descriptor = getRuntimeDescriptor(node, { edges: [], incomingByNode: new Map(), nodeById: new Map([[node.id, node]]) });
  assert.deepEqual(descriptor, { handlerType: 'ai.image.analyze', config: {
    model: 'google/gemini-2.5-flash', analysisPreset: 'graphics', preset: 'typography', presets: ['typography'], prompt: 'Authored rules.',
  } });
  (node.data as ImageToTextNodeData).presets!.push('whitespace');
  assert.deepEqual(descriptor.config.presets, ['typography']);
});

test('legacy Extract descriptors default to Composition and retain a saved prompt', () => {
  const node = createDefaultNode('imageToText', { x: 0, y: 0 });
  delete (node.data as ImageToTextNodeData).analysisPreset;
  const descriptor = getRuntimeDescriptor(node, { edges: [], incomingByNode: new Map(), nodeById: new Map([[node.id, node]]) });
  assert.equal(descriptor.config.analysisPreset, 'composition');
  assert.equal(descriptor.config.prompt, buildExtractPrompt(['default']).systemPrompt);
});

test('both inferred and explicit pipeline publication keep the Extract profile and prompt', () => {
  for (const explicit of [false, true]) {
    const source = createDefaultNode(explicit ? 'pipelineInput' : 'importImage', { x: 20, y: 20 });
    if (explicit) source.data = { ...source.data, fields: [{ id: 'reference', key: 'reference', kind: 'image', required: true }] } as PipelineInputNodeData;
    const node = createDefaultNode('imageToText', { x: 420, y: 20 });
    node.data = { ...node.data, analysisPreset: 'location', presets: ['architecture'], prompt: buildExtractPrompt(['architecture'], 'location').systemPrompt } as ImageToTextNodeData;
    const output = createDefaultNode('pipelineOutput', { x: 820, y: 20 });
    output.data = { ...output.data, fields: [{ id: 'description', key: 'description', kind: 'text', required: true }] } as PipelineOutputNodeData;
    const section = { id: 'extract-section', title: 'Extract', position: { x: 0, y: 0 }, size: { width: 1600, height: 1500 } };
    const project = { ...structuredClone(initialProject), nodes: explicit ? [source, node, output] : [source, node], sections: [section], edges: [
      { id: 'in', sourceNodeId: source.id, sourcePortId: explicit ? 'field:reference' : 'image', targetNodeId: node.id, targetPortId: 'image-0' },
      ...(explicit ? [{ id: 'out', sourceNodeId: node.id, sourcePortId: 'result', targetNodeId: output.id, targetPortId: 'field:description' }] : []),
    ] };
    const compiled = compileStudioSection(project, section.id);
    const config = compiled.compiledPlan.definition.nodes.find((item) => item.id === node.id)!.config;
    assert.equal(config.analysisPreset, 'location');
    assert.deepEqual(config.presets, ['architecture']);
    assert.equal(config.prompt, (node.data as ImageToTextNodeData).prompt);
  }
});
