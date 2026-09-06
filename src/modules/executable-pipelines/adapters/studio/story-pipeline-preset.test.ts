import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePortableProjectExport } from '@/entities/production-graph/model/project-portability';
import { getSystemPipelinePreset } from '@/entities/production-graph/model/system-pipeline-presets';
import {
  preparePipelineInputValues,
  validatePipelineOutputValues,
} from '../../core/pipeline-io-validation';
import { compileStudioSection } from './studio-pipeline-compiler';

test('story.asset.render.v1 is a portable executable pipeline with a simple brief input and pinned output', () => {
  const preset = getSystemPipelinePreset('story.asset.render.v1');
  assert.ok(preset);
  const imported = normalizePortableProjectExport(preset.template);
  const section = imported.project.sections[0];
  assert.ok(section);

  const compilation = compileStudioSection(imported.project, section.id);
  const definition = compilation.compiledPlan.definition;
  assert.equal(section.capabilityKey, 'story.asset.render.v1');
  assert.equal(compilation.sourceMetadata.capabilityKey, 'story.asset.render.v1');
  assert.equal(definition.inputSemanticContract, undefined);
  assert.equal(definition.outputSemanticContract?.contractKey, 'story.production.result.v1');
  assert.deepEqual(definition.inputs, {
    brief: {
      kind: 'text',
      required: true,
      description: 'Коротко опишите, что должно быть изображено на фоне.',
    },
  });
  assert.deepEqual(definition.nodes.map((node) => node.handlerType), [
    'ai.text.generate',
    'ai.image.generate',
  ]);
  assert.deepEqual(definition.outputs.background, {
    nodeId: 'story-generate',
    outputKey: 'image',
  });

  const prepared = preparePipelineInputValues(definition.inputs, {
    brief: 'Тёплый фон для анонса запуска.',
  }, definition.inputSemanticContract);
  assert.deepEqual(prepared, { brief: 'Тёплый фон для анонса запуска.' });

  assert.throws(
    () => preparePipelineInputValues(definition.inputs, {
      brief: 'Тёплый фон для анонса запуска.',
      storyId: 'story-1',
    }, definition.inputSemanticContract),
    /Unknown pipeline input "storyId"/,
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
    title: 'Летний запуск',
    subtitle: 'Новая серия уже доступна',
    body: 'Посмотрите детали в приложении.',
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

  assert.throws(() => validatePipelineOutputValues(definition.outputContracts!, {
    background: {
      assetId: 'asset-1',
      checksumSha256: 'a'.repeat(64),
      contentUrl: '/v1/runs/run-1/artifacts/asset-1',
      height: 1920,
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: 100,
      width: 1080,
    },
    title: '',
  }, definition.outputSemanticContract), /at least 1 characters/);
});
