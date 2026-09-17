import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TIMELINE_MODEL, TIMELINE_MODEL_OPTIONS } from '@/shared/api/timeline-models';
import { NODE_HELP_METADATA } from '@/entities/production-graph/model/node-help';
import { getAssistantNodeCatalog } from './node-catalog';
import { sanitizePipelineNodeSettings } from './pipeline-node-settings';

test('Timeline agent only authors allowlisted settings, never private assets or analysis', () => {
  assert.equal(TIMELINE_MODEL_OPTIONS.length, 6);
  assert.deepEqual(sanitizePipelineNodeSettings('timelineHandoff', {
    title: 'Handoff', model: DEFAULT_TIMELINE_MODEL, language: 'system', threshold: 10,
    analysis: { sourceAssetId: 'forged' }, sourceAssetId: 'forged', activeShotIndex: 1, detail: 'verbose',
  }), { title: 'Handoff', model: DEFAULT_TIMELINE_MODEL, language: 'system', threshold: 10, activeShotIndex: 1 });
  assert.deepEqual(sanitizePipelineNodeSettings('timelineHandoff', { model: 'unknown/expensive-model', threshold: -1 }), {});
  assert.deepEqual(sanitizePipelineNodeSettings('speechToText', { threshold: 10 }), {});
});

test('Timeline live catalog explains staged review, brief descriptions, full JSON and runtime restrictions', () => {
  const [node] = getAssistantNodeCatalog('раскадровка');
  assert.equal(node?.type, 'timelineHandoff');
  assert.deepEqual(node?.configurableFields, ['title', 'model', 'language', 'threshold', 'outputScope', 'activeShotIndex']);
  assert.deepEqual(node?.ports.map(({ id, kind }) => ({ id, kind })), [{ id: 'video', kind: 'video' }, { id: 'timeline', kind: 'json' }, { id: 'videoResult', kind: 'video' }, { id: 'frames', kind: 'image' }, { id: 'descriptions', kind: 'text' }]);
  const help = NODE_HELP_METADATA.timelineHandoff;
  assert.match(help.capabilities.join(' '), /FFmpeg.*без обращения к платной модели/u);
  assert.match(help.capabilities.join(' '), /Describe current.*Describe all.*1500 символов/u);
  assert.match(help.portRules.join(' '), /timelineHandoff\.timeline -> pipelineOutput/u);
  assert.match(help.limitations.join(' '), /Подготовка клипа.*Не объединяет планы в сцены/u);
  assert.match(help.limitations.join(' '), /Внешний запуск не выполняет новый автоматический разбор/u);
});
