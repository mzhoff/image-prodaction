import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePortableProjectExport } from '@/entities/production-graph/model/project-portability';
import { getSystemPipelinePreset } from '@/entities/production-graph/model/system-pipeline-presets';
import {
  preparePipelineInputValues,
  validatePipelineOutputValues,
} from '../../core/pipeline-io-validation';
import { compilePipelineDefinition } from '../../core/pipeline-compiler';
import { compileStudioSection } from './studio-pipeline-compiler';

test('story.asset.render.v1 is a portable executable pipeline with pinned semantic boundaries', () => {
  const preset = getSystemPipelinePreset('story.asset.render.v1');
  assert.ok(preset);
  const imported = normalizePortableProjectExport(preset.template);
  const section = imported.project.sections[0];
  assert.ok(section);

  const compilation = compileStudioSection(imported.project, section.id);
  const definition = compilation.compiledPlan.definition;
  assert.equal(section.capabilityKey, 'story.asset.render.v1');
  assert.equal(compilation.sourceMetadata.capabilityKey, 'story.asset.render.v1');
  assert.equal(definition.inputSemanticContract?.contractKey, 'story.production.request.v1');
  assert.equal(definition.outputSemanticContract?.contractKey, 'story.production.result.v1');
  assert.deepEqual(definition.nodes.map((node) => node.handlerType), [
    'ai.text.generate',
    'ai.image.generate',
  ]);
  assert.deepEqual(definition.outputs.background, {
    nodeId: 'story-generate',
    outputKey: 'image',
  });

  const prepared = preparePipelineInputValues(definition.inputs, {
    storyId: 'story-1',
    revisionId: 'revision-1',
    slideId: 'slide-1',
    brief: 'Тёплый фон для анонса запуска.',
    locale: 'ru-RU',
    aspectRatio: '9:16',
    imageSize: '1K',
    formatKey: 'story-full-hd',
  }, definition.inputSemanticContract);
  assert.equal(prepared.locale, 'ru-RU');
  assert.equal(prepared.aspectRatio, '9:16');
  assert.equal(prepared.imageSize, '1K');
  assert.equal(prepared.formatKey, 'story-full-hd');

  const conflictingRequired = structuredClone(definition);
  conflictingRequired.inputs.locale!.required = false;
  assert.throws(
    () => compilePipelineDefinition(conflictingRequired),
    /conflicting required metadata/,
  );

  assert.doesNotThrow(() => validatePipelineOutputValues(definition.outputContracts!, {
    background: {
      assetId: 'asset-1',
      checksumSha256: 'a'.repeat(64),
      contentUrl: '/v1/runs/run-1/artifacts/asset-1',
      height: 1792,
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: 100,
      width: 1024,
    },
  }, definition.outputSemanticContract));
});

test('story semantic output rejects incomplete artifact metadata', () => {
  const preset = getSystemPipelinePreset('story.asset.render.v1');
  assert.ok(preset);
  const imported = normalizePortableProjectExport(preset.template);
  const section = imported.project.sections[0]!;
  const definition = compileStudioSection(imported.project, section.id).compiledPlan.definition;

  assert.throws(() => validatePipelineOutputValues(definition.outputContracts!, {
    background: { assetId: 'asset-1', kind: 'image' },
  }, definition.outputSemanticContract), /checksumSha256 is required/);

  assert.throws(() => validatePipelineOutputValues(definition.outputContracts!, {
    background: {
      assetId: 'asset-1',
      checksumSha256: 'z'.repeat(64),
      contentUrl: '/v1/runs/run-1/artifacts/asset-1',
      height: 1920,
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: 100,
      width: 1080,
    },
  }, definition.outputSemanticContract), /required pattern/);
});
