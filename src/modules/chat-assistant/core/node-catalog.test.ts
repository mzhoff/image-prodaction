import assert from 'node:assert/strict';
import test from 'node:test';
import { getAssistantNodeCatalog } from './node-catalog.ts';

test('assistant node catalog is derived from the live product registry', () => {
  const nodes = getAssistantNodeCatalog();
  const prompt = nodes.find((node) => node.type === 'textPrompt');
  const generateImage = nodes.find((node) => node.type === 'generateImage');

  assert.equal(nodes.length, 26);
  assert.ok(prompt?.ports.some((port) => port.id === 'text' && port.side === 'output'));
  assert.ok(prompt?.configurableFields.includes('text'));
  assert.ok(prompt?.configurableFields.includes('variables'));
  assert.ok(prompt?.portRules.some((rule) => rule.includes('variable-0')));
  assert.ok(generateImage?.ports.some((port) => port.id === 'prompt' && port.kind === 'text'));
  assert.ok(generateImage?.configurableFields.includes('prompt'));
  assert.deepEqual(
    getAssistantNodeCatalog('textGeneration textFormatter telegramPublication ports')
      .map((node) => node.type),
    ['textConcat', 'textGeneration', 'textFormatter', 'telegramPublication'],
  );
  assert.ok(getAssistantNodeCatalog('textFormatter')[0]?.configurableFields.includes('presetId'));
  const concat = getAssistantNodeCatalog('склеивание текста');
  assert.deepEqual(concat.map((node) => node.type), ['textConcat']);
  assert.match(concat[0]?.description ?? '', /два или больше текстовых входа/u);
  assert.ok(concat[0]?.portRules.some((rule) => rule.includes('text-2')));
  assert.deepEqual(getAssistantNodeCatalog('шаблон с переменными').map((node) => node.type), ['textPrompt']);
  assert.deepEqual(getAssistantNodeCatalog('remove bg').map((node) => node.type), ['removeBackground']);
  const composition = getAssistantNodeCatalog('сборка слоёв');
  assert.deepEqual(composition.map((node) => node.type), ['composition']);
  assert.match(composition[0]?.portRules.join(' ') ?? '', /layer-0.*layer-1.*layer-2/u);
  const importNode = getAssistantNodeCatalog('входное изображение');
  assert.match(importNode[0]?.description ?? '', /sourceAttachmentIndex.*не передавай/u);
  assert.equal(getAssistantNodeCatalog('node groups генерация prompt export preview').length, nodes.length);
  assert.equal(getAssistantNodeCatalog('совершенно неизвестная нода').length, nodes.length);
});
