import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { buildExtractPrompt } from '@/entities/production-graph/model/extract-presets';
import type { ImageToTextNodeData } from '@/entities/production-graph/model/types';
import { imageProductionTools, PIPELINE_BUILD_TOOL, PIPELINE_NODE_CONFIGURABLE_FIELDS } from '../contracts/image-production-tools';
import { getAssistantNodeCatalog } from './node-catalog';
import { applyPipelineBuildPatch, parsePipelineBuildInput, preparePipelineBuild } from './pipeline-build';
import { applyPipelineUpdatePatch, pipelineUpdateInputSchema, preparePipelineUpdate } from './pipeline-update';
import { mergeExtractNodeSettings } from './pipeline-extract-settings';

function prepare(settings: Record<string, unknown>) {
  return preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Extract preset check', summary: 'Prepare a configured Extract node.',
    nodes: [{ key: 'extract', type: 'imageToText', settings }], edges: [],
  }), structuredClone(initialProject));
}

test('assistant builds Graphics and selected Layers with the shared prompt, without execution', () => {
  const prepared = prepare({ analysisPreset: 'graphics', presets: ['typography', 'whitespace'], model: 'vision-model' });
  const data = prepared.patch.nodes[0].data as ImageToTextNodeData;
  assert.equal(data.analysisPreset, 'graphics');
  assert.equal(data.model, 'vision-model');
  assert.deepEqual(data.presets, ['typography', 'whitespace']);
  assert.equal(data.prompt, buildExtractPrompt(['typography', 'whitespace'], 'graphics').systemPrompt);
  assert.equal(prepared.safePreview.nodes[0].settings.presets, 'typography, whitespace');
});

test('serialized assistant profile update saves and restores authored drafts between frameworks', () => {
  const built = prepare({ preset: 'actors' });
  let project = applyPipelineBuildPatch(structuredClone(initialProject), built.patch);
  const extract = project.nodes[0];
  const changeProfile = (analysisPreset: string) => {
    const prepared = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
      summary: 'Change the Extract framework.', updates: [{ nodeId: extract.id, settings: { analysisPreset } }],
    }), project);
    project = applyPipelineUpdatePatch(project, JSON.parse(JSON.stringify(prepared.patch)));
    return project.nodes[0].data as ImageToTextNodeData;
  };
  const changed = changeProfile('character');
  assert.deepEqual(changed.presets, ['default']);
  assert.equal(changed.prompt, buildExtractPrompt(['default'], 'character').systemPrompt);
  changed.prompt = 'My authored scene instructions, preserve exactly.';
  assert.equal(changeProfile('location').prompt, buildExtractPrompt(['default'], 'location').systemPrompt);
  assert.equal(changeProfile('character').prompt, 'My authored scene instructions, preserve exactly.');
});

test('legacy layer fields remain supported, explicit foreign Layers do not become an all-layer run', () => {
  assert.deepEqual((prepare({ preset: 'camera' }).patch.nodes[0].data as ImageToTextNodeData).presets, ['camera']);
  assert.throws(() => prepare({ analysisPreset: 'graphics', presets: ['actors'] }), /Layers.*graphics/);
  const legacy = createDefaultNode('imageToText', { x: 0, y: 0 }).data as ImageToTextNodeData;
  delete legacy.analysisPreset;
  const changed = mergeExtractNodeSettings(legacy, { title: 'Renamed' });
  assert.equal(changed.analysisPreset, 'composition');
  assert.equal(changed.prompt, legacy.prompt);
});

test('live catalog and tool schema expose framework, layers, and exact new layer IDs', () => {
  const catalog = getAssistantNodeCatalog('imageToText')[0];
  assert.ok(PIPELINE_NODE_CONFIGURABLE_FIELDS.imageToText.includes('analysisPreset'));
  assert.ok(PIPELINE_NODE_CONFIGURABLE_FIELDS.imageToText.includes('presets'));
  assert.match(catalog.capabilities.join(' '), /Graphics.*typography.*whitespace/);
  assert.match(catalog.capabilities.join(' '), /Character.*facial_features/);
  assert.match(catalog.capabilities.join(' '), /Location.*architecture/);
  const schema = JSON.stringify(imageProductionTools.find((tool) => tool.name === PIPELINE_BUILD_TOOL)?.inputSchema);
  assert.match(schema, /analysisPreset/);
  assert.match(schema, /graphic_style/);
  assert.match(schema, /facial_features/);
});
