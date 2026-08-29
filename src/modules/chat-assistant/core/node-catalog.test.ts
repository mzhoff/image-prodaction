import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import { getAssistantNodeCatalog } from './node-catalog.ts';

test('assistant node catalog is derived from the live product registry', () => {
  const nodes = getAssistantNodeCatalog();
  const prompt = nodes.find((node) => node.type === 'textPrompt');
  const generateImage = nodes.find((node) => node.type === 'generateImage');

  assert.equal(nodes.length, PRODUCTION_NODE_TYPES.length);
  assert.ok(prompt?.ports.some((port) => port.id === 'text' && port.side === 'output'));
  assert.ok(prompt?.configurableFields.includes('text'));
  assert.ok(prompt?.configurableFields.includes('variables'));
  assert.ok(prompt?.portRules.some((rule) => rule.includes('variable-0')));
  assert.ok(generateImage?.ports.some((port) => port.id === 'prompt' && port.kind === 'text'));
  assert.ok(generateImage?.configurableFields.includes('prompt'));
  assert.deepEqual(
    getAssistantNodeCatalog('textGeneration textFormatter telegramPublication ports')
      .map((node) => node.type),
    ['textConcat', 'textGeneration', 'textFormatter', 'telegramPublication', 'composition'],
  );
  assert.ok(getAssistantNodeCatalog('textFormatter')[0]?.configurableFields.includes('presetId'));
  const concat = getAssistantNodeCatalog('склеивание текста');
  assert.deepEqual(concat.map((node) => node.type), ['textConcat']);
  assert.match(concat[0]?.description ?? '', /два или больше текстовых входа/u);
  assert.ok(concat[0]?.portRules.some((rule) => rule.includes('text-2')));
  assert.deepEqual(getAssistantNodeCatalog('шаблон с переменными').map((node) => node.type), ['textPrompt']);
  assert.deepEqual(getAssistantNodeCatalog('remove bg').map((node) => node.type), ['removeBackground']);
  const qr = getAssistantNodeCatalog('генератор qr-кода');
  assert.deepEqual(qr.map((node) => node.type), ['qrCode']);
  assert.ok(qr[0]?.ports.some((port) => port.id === 'text' && port.kind === 'text' && port.side === 'input'));
  assert.ok(qr[0]?.ports.some((port) => port.id === 'image' && port.kind === 'image' && port.side === 'output'));
  assert.deepEqual(qr[0]?.configurableFields, ['title', 'content', 'contentMode']);
  assert.match(qr[0]?.description ?? '', /без AI-генерации/u);
  assert.match(qr[0]?.portRules.join(' ') ?? '', /targetUrl.*field:target-url.*qrCode\.text/u);
  assert.match(qr[0]?.portRules.join(' ') ?? '', /URL не дан.*не спрашивай.*не выдумывай.*пустым локально редактируемым content/u);
  assert.match(qr[0]?.portRules.join(' ') ?? '', /не требует pipelineInput\/pipelineOutput.*явном запросе/u);
  assert.match(qr[0]?.portRules.join(' ') ?? '', /Не используй generateImage/u);
  assert.match(qr[0]?.portRules.join(' ') ?? '', /product-owned.*не передавай.*assistant settings.*JPEG\/SVG не поддерживаются/u);
  const composition = getAssistantNodeCatalog('сборка слоёв');
  assert.deepEqual(composition.map((node) => node.type), ['composition']);
  assert.match(composition[0]?.portRules.join(' ') ?? '', /layer-0.*layer-1.*layer-2/u);
  assert.match(composition[0]?.portRules.join(' ') ?? '', /максимум 24/u);
  assert.match(composition[0]?.portRules.join(' ') ?? '', /qrCode\.image/u);
  assert.match(composition[0]?.portRules.join(' ') ?? '', /textPrompt\.text.*textGeneration\.result.*нативный перемещаемый текстовый слой/u);
  assert.match(composition[0]?.portRules.join(' ') ?? '', /composition\.image.*exportImage\.image-0/u);
  assert.match(composition[0]?.portRules.join(' ') ?? '', /Не добавляй pipelineInput\/pipelineOutput.*без явного запроса/u);
  assert.match(composition[0]?.portRules.join(' ') ?? '', /переиспользуемый межпродуктовый контракт.*отдельный этап/u);
  assert.match(composition[0]?.portRules.join(' ') ?? '', /compositionBlueprints V1.*compiler.*layer-N/u);
  assert.match(prompt?.portRules.join(' ') ?? '', /текст частью общего generateImage-арта.*явно хочет управлять/u);
  const importNode = getAssistantNodeCatalog('входное изображение');
  assert.match(importNode[0]?.description ?? '', /sourceAttachmentIndex.*не передавай/u);
  const structuredOutput = getAssistantNodeCatalog('структурированный вывод');
  assert.deepEqual(structuredOutput.map((node) => node.type), ['structuredOutput']);
  assert.ok(structuredOutput[0]?.configurableFields.includes('fields'));
  assert.match(structuredOutput[0]?.portRules.join(' ') ?? '', /field:<field\.id>/u);
  assert.equal(getAssistantNodeCatalog('node groups генерация prompt export preview').length, nodes.length);
  assert.equal(getAssistantNodeCatalog('совершенно неизвестная нода').length, nodes.length);
});
