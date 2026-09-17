import assert from 'node:assert/strict';
import test from 'node:test';
import { extractAnalysisPresets, getExtractLayers } from './extract-analysis-profiles.ts';
import { buildExtractPrompt, getExtractSystemPrompt, normalizeExtractPresetSelection } from './extract-presets.ts';
import { extractLayerTextSectionParseOptions, getFilteredExtractLayerText } from './extract-layer-parser.ts';
import { normalizeImageNode } from './normalize-project-image-nodes.ts';
import { parseTextSectionFilters } from './text-section-filters.ts';
import { getNodeTextResult } from './graph-text-outputs.ts';
import { reconcileTextSplitterSlots } from './text-splitter-slots.ts';
import type { ImageToTextNodeData, ProductionNode } from './types.ts';

function extract(data: Partial<ImageToTextNodeData>): ProductionNode {
  return { id: 'extract', type: 'imageToText', position: { x: 0, y: 0 }, size: { width: 280, height: 560 }, status: 'idle', data: { title: 'Extract', ...data } };
}

test('legacy Extract retains Composition selections, custom prompt and result on reload', () => {
  const legacy = extract({ preset: 'camera', presets: ['camera', 'color'], prompt: 'Мой собственный промпт', result: '[CAMERA]\nРакурс', disabledLayerIds: ['camera'] });
  const normalized = normalizeImageNode(legacy)!;
  assert.deepEqual(normalized.data, { ...legacy.data, title: 'Extract', model: 'google/gemini-2.5-flash', analysisPreset: 'composition', analysisPresetDrafts: undefined });
});

test('profile and per-profile custom drafts survive JSON save and normalization', () => {
  const source = extract({ analysisPreset: 'graphics', preset: 'typography', prompt: 'Мой шрифт', disabledLayerIds: ['typography', 'appearance'],
    analysisPresetDrafts: { composition: { presets: ['camera'], prompt: 'Моя камера' }, graphics: { presets: ['whitespace'], prompt: 'Мой воздух' } },
    result: '[TYPOGRAPHY]\nГротеск' });
  const normalized = normalizeImageNode(JSON.parse(JSON.stringify(source)))!.data as ImageToTextNodeData;
  assert.equal(normalized.analysisPreset, 'graphics');
  assert.deepEqual(normalized.presets, ['typography']);
  assert.equal(normalized.prompt, 'Мой шрифт');
  assert.equal(normalized.result, (source.data as ImageToTextNodeData).result);
  assert.deepEqual(normalized.disabledLayerIds, ['typography', 'appearance']);
  assert.deepEqual(normalized.analysisPresetDrafts, (source.data as ImageToTextNodeData).analysisPresetDrafts);
});

test('All Layers means all layers of the chosen task; foreign selections are excluded', () => {
  assert.deepEqual(getExtractLayers().map((layer) => layer.id), ['actors', 'actions', 'composition', 'camera', 'background', 'style', 'light', 'color', 'metaphor', 'text']);
  assert.deepEqual(normalizeExtractPresetSelection(['typography', 'actors', 'typography'], 'graphics'), ['typography']);
  assert.deepEqual(normalizeExtractPresetSelection(['actors'], 'graphics'), ['default']);
  for (const profile of extractAnalysisPresets) {
    assert.deepEqual(buildExtractPrompt(['default'], profile.id).selectedLayers, profile.layers.map((layer) => layer.id));
    assert.deepEqual(normalizeExtractPresetSelection(profile.layers.map((layer) => layer.id), profile.id), ['default']);
  }
});

test('every selected layer has its own task and exact, parseable output badge', () => {
  for (const profile of extractAnalysisPresets) {
    for (const layer of profile.layers) {
      const prompt = buildExtractPrompt([layer.id], profile.id);
      assert.deepEqual(prompt.selectedLayers, [layer.id]);
      const taskSection = prompt.systemPrompt.split('[SELECTED LAYER TASKS]')[1].split('Верни результат строго')[0];
      assert.match(taskSection, new RegExp(`\\[${layer.label.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`));
      for (const other of profile.layers.filter((entry) => entry.id !== layer.id)) assert.ok(!taskSection.includes(`[${other.label.toUpperCase()}]`));
      const result = `[${layer.label.toUpperCase()}]\nGeneration-ready description:\nОписание слоя`;
      assert.deepEqual(parseTextSectionFilters(result, extractLayerTextSectionParseOptions).map((section) => section.id), [layer.id]);
      assert.equal(getFilteredExtractLayerText(result, [layer.id]), '');
    }
  }
});

test('preset-specific instructions apply to both single and multiple references', () => {
  assert.match(getExtractSystemPrompt('graphics'), /graphic designer/);
  assert.match(getExtractSystemPrompt('character'), /never as facts about a real person/);
  assert.match(getExtractSystemPrompt('location'), /interior or exterior/);
  for (const profile of extractAnalysisPresets) {
    assert.match(getExtractSystemPrompt(profile.id, true), /shared visual patterns/);
    assert.ok(getExtractSystemPrompt(profile.id, true).includes(profile.systemPrompt));
  }
});

test('new layer badges filter downstream output and keep Splitter slots stable', () => {
  const fragments = ['[TYPOGRAPHY]\nГротеск', '[WHITESPACE]\nШирокие поля', '[VISUAL HIERARCHY]\nОдин акцент'];
  const node = extract({ analysisPreset: 'graphics', result: fragments.join('\n\n'), disabledLayerIds: ['whitespace'] });
  const output = getNodeTextResult(node);
  assert.equal(output, [fragments[0], fragments[2]].join('\n\n'));
  const previous = reconcileTextSplitterSlots(fragments, {});
  const next = reconcileTextSplitterSlots([fragments[0], fragments[2]], previous);
  assert.deepEqual(next.items, [fragments[0], '', fragments[2]]);
  assert.deepEqual(next.itemKeys, ['section:typography', 'section:whitespace', 'section:hierarchy']);
});
