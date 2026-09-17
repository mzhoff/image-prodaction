import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { applyPipelineBuildPatch, parsePipelineBuildInput, preparePipelineBuild } from './pipeline-build.ts';
import { applyPipelineUpdatePatch, pipelineUpdateInputSchema, preparePipelineUpdate } from './pipeline-update.ts';
import { sanitizePipelineNodeSettings } from './pipeline-node-settings.ts';
import { getAssistantNodeCatalog } from './node-catalog.ts';

const brief = [
  'Один лист 16:9 на белом фоне #FFFFFF. Слева 3 полнофигуры: фронт, правый профиль, спина.',
  'Справа квадрат 2×2: фронт, профиль, 3/4 вправо, 3/4 влево; видна одежда у плеч.',
  'Лицо по ref1–ref4, одежда только по ref5: белые штаны, синяя футболка с длинным рукавом.',
  'Мягкий свет слева 45°, поля 5%, без обрезанных стоп и темени, без текста и логотипов.',
].join('\n');
const instruction = 'Подготовь промпт по всему подключённому брифу. Сохрани ракурсы, сетку, одежду, свет и запреты; не добавляй новых объектов.';

function preparePortraitGraph() {
  return preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Лист персонажа 16:9',
    summary: 'Заполненный граф по брифу без дополнительных объектов.',
    nodes: [
      { key: 'brief', type: 'textPrompt', settings: { text: brief } },
      { key: 'rules', type: 'textGeneration', settings: { instruction } },
      { key: 'image', type: 'generateImage', settings: { aspectRatio: '16:9' } },
    ],
    edges: [
      { sourceNodeKey: 'brief', sourcePortId: 'text', targetNodeKey: 'rules', targetPortId: 'text' },
      { sourceNodeKey: 'rules', sourcePortId: 'result', targetNodeKey: 'image', targetPortId: 'prompt' },
    ],
  }), structuredClone(initialProject));
}

test('build and apply preserve the complete supplied brief, instructions and ratio without running AI', () => {
  const prepared = preparePortraitGraph();
  const project = applyPipelineBuildPatch(structuredClone(initialProject), prepared.patch);
  const source = project.nodes.find((node) => node.type === 'textPrompt')!;
  const rules = project.nodes.find((node) => node.type === 'textGeneration')!;
  const image = project.nodes.find((node) => node.type === 'generateImage')!;
  assert.equal('text' in source.data && source.data.text, brief);
  assert.equal('instruction' in rules.data && rules.data.instruction, instruction);
  assert.equal('aspectRatio' in image.data && image.data.aspectRatio, '16:9');
  assert.equal('prompt' in image.data && image.data.prompt, '');
  assert.equal('result' in rules.data && rules.data.result, '');
  assert.equal(project.nodes.some((node) => node.type === 'qrCode'), false);
  assert.deepEqual(prepared.safePreview.warnings, []);
});

test('recovers Text Gen prompt passed under the image field name instead of discarding the brief', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Recovered instructions',
    summary: 'Regression for a Text Gen prompt from the reported conversation.',
    nodes: [{ key: 'brief', type: 'textGeneration', settings: { prompt: brief } }],
    edges: [],
  }), structuredClone(initialProject));
  const rules = prepared.patch.nodes[0];
  assert.equal('instruction' in rules.data && rules.data.instruction, brief);
  assert.equal('prompt' in rules.data, false);
  assert.equal(prepared.safePreview.nodes[0].settings.instruction, brief);
  assert.match(prepared.safePreview.warnings.join(' '), /prompt.*instruction.*текст сохранён/u);
});

test('the same field recovery applies to existing nodes and new nodes in pipeline_update', () => {
  const current = applyPipelineBuildPatch(structuredClone(initialProject), preparePortraitGraph().patch);
  const rules = current.nodes.find((node) => node.type === 'textGeneration')!;
  const before = structuredClone(current);
  const prepared = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
    summary: 'Fill updated instructions without losing text.',
    updates: [{ nodeId: rules.id, settings: { prompt: brief } }],
    nodes: [{ key: 'newRules', type: 'textGeneration', settings: { prompt: instruction } }],
  }), current);
  assert.deepEqual(current, before);
  const updated = applyPipelineUpdatePatch(current, prepared.patch);
  const updatedRules = updated.nodes.find((node) => node.id === rules.id)!;
  assert.equal('instruction' in updatedRules.data && updatedRules.data.instruction, brief);
  assert.equal('instruction' in prepared.patch.addedNodes[0].data && prepared.patch.addedNodes[0].data.instruction, instruction);
});

test('does not guess between conflicting Text Gen instructions or mutate the request', () => {
  const settings = { prompt: brief, instruction };
  assert.throws(() => sanitizePipelineNodeSettings('textGeneration', settings), /Conflicting.*use only instruction/u);
  assert.deepEqual(settings, { prompt: brief, instruction });
  assert.deepEqual(sanitizePipelineNodeSettings('textGeneration', { prompt: instruction, instruction }), { instruction });
});

test('invalid or oversized authored text fails preparation instead of silently leaving defaults', () => {
  for (const [type, field] of [
    ['textPrompt', 'text'], ['textGeneration', 'instruction'],
    ['textGeneration', 'prompt'], ['generateImage', 'prompt'],
  ] as const) {
    for (const value of [brief.repeat(20), 123, null]) {
      assert.throws(() => sanitizePipelineNodeSettings(type, { [field]: value }), /provide a string.*split longer content/u);
    }
  }
  assert.deepEqual(sanitizePipelineNodeSettings('textGeneration', { instruction: '' }), { instruction: '' });
  assert.deepEqual(sanitizePipelineNodeSettings('textGeneration', { instruction: 'а'.repeat(4000) }), { instruction: 'а'.repeat(4000) });
  assert.deepEqual(sanitizePipelineNodeSettings('generateImage', { prompt: brief }), { prompt: brief });
});

test('live catalog explains the canonical text fields and recovery, without adding a prompt port or setting', () => {
  const node = getAssistantNodeCatalog('textGeneration')[0];
  assert.ok(node.configurableFields.includes('instruction'));
  assert.equal(node.configurableFields.includes('prompt'), false);
  assert.match(node.portRules.join(' '), /settings\.instruction.*settings\.prompt.*нормализуется/u);
  assert.match(getAssistantNodeCatalog('textPrompt')[0].capabilities.join(' '), /settings\.text/u);
});
