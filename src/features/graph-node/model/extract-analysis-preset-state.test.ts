import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExtractPrompt } from '@/entities/production-graph/model/extract-presets';
import type { ImageToTextNodeData } from '@/entities/production-graph/model/types';
import { getExtractAnalysisPresetPatch } from './extract-analysis-preset-state';

test('legacy Extract keeps its custom Composition prompt and layer when another preset is tried', () => {
  const original: ImageToTextNodeData = {
    title: 'My Extract', preset: 'actors', prompt: 'Мой авторский промпт',
    result: '[ACTORS]\nСохранённый результат', disabledLayerIds: ['actors'],
  };
  const graphicsPatch = getExtractAnalysisPresetPatch(original, 'graphics')!;
  assert.equal(graphicsPatch.analysisPreset, 'graphics');
  assert.deepEqual(graphicsPatch.presets, ['default']);
  assert.equal(graphicsPatch.prompt, buildExtractPrompt(['default'], 'graphics').systemPrompt);
  assert.equal('result' in graphicsPatch, false);
  assert.equal('disabledLayerIds' in graphicsPatch, false);
  assert.equal(original.analysisPresetDrafts, undefined);

  const graphicsNode = { ...original, ...graphicsPatch };
  const restored = { ...graphicsNode, ...getExtractAnalysisPresetPatch(graphicsNode, 'composition') };
  assert.equal(restored.prompt, 'Мой авторский промпт');
  assert.deepEqual(restored.presets, ['actors']);
  assert.equal(restored.result, original.result);
  assert.deepEqual(restored.disabledLayerIds, ['actors']);
});

test('profile drafts survive document serialization and preserve the most recent manual edits', () => {
  const original: ImageToTextNodeData = {
    title: 'Extract', analysisPreset: 'graphics', preset: 'typography', presets: ['typography'],
    prompt: 'Опиши только надписи без перевода.',
  };
  const characterNode = { ...original, ...getExtractAnalysisPresetPatch(original, 'character') };
  characterNode.presets = ['appearance'];
  characterNode.preset = 'appearance';
  characterNode.prompt = 'Сохрани форму причёски персонажа.';
  const serialized = JSON.parse(JSON.stringify(characterNode)) as ImageToTextNodeData;
  const graphicsNode = { ...serialized, ...getExtractAnalysisPresetPatch(serialized, 'graphics') };
  assert.deepEqual(graphicsNode.presets, ['typography']);
  assert.equal(graphicsNode.prompt, original.prompt);

  const restoredCharacter = { ...graphicsNode, ...getExtractAnalysisPresetPatch(graphicsNode, 'character') };
  assert.deepEqual(restoredCharacter.presets, ['appearance']);
  assert.equal(restoredCharacter.prompt, characterNode.prompt);
});

test('choosing the active preset is a no-op and deliberately emptied prompts remain empty on return', () => {
  const original: ImageToTextNodeData = { title: 'Extract', preset: 'camera', prompt: '' };
  assert.equal(getExtractAnalysisPresetPatch(original, 'composition'), null);
  const next = { ...original, ...getExtractAnalysisPresetPatch(original, 'location') };
  assert.equal(getExtractAnalysisPresetPatch(next, 'location'), null);
  const restored = { ...next, ...getExtractAnalysisPresetPatch(next, 'composition') };
  assert.equal(restored.prompt, '');
  assert.deepEqual(restored.presets, ['camera']);
});

test('a previously visited preset never inherits incompatible layers from the outgoing preset', () => {
  const original: ImageToTextNodeData = {
    title: 'Extract', analysisPreset: 'character', preset: 'appearance', presets: ['appearance'],
    analysisPresetDrafts: { graphics: { presets: ['typography'], prompt: 'Сохранённая типографика' } },
  };
  const patch = getExtractAnalysisPresetPatch(original, 'graphics')!;
  assert.deepEqual(patch.presets, ['typography']);
  assert.equal(patch.prompt, 'Сохранённая типографика');
  assert.equal(patch.analysisPresetDrafts.character!.prompt, buildExtractPrompt(['appearance'], 'character').systemPrompt);
});
