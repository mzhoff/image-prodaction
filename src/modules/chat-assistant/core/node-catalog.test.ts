import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNodeAskAiDraft } from '@/entities/production-graph/model/node-help';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import { getAssistantNodeCatalog } from './node-catalog.ts';

test('assistant node catalog exposes complete product-owned help for the live registry', () => {
  const nodes = getAssistantNodeCatalog();

  assert.deepEqual(nodes.map((node) => node.type), PRODUCTION_NODE_TYPES);
  assert.equal(nodes.length, 30);
  for (const node of nodes) {
    assert.ok(node.aliases.length > 0, `${node.type} has no aliases`);
    assert.ok(node.description.length > 0, `${node.type} has no description`);
    assert.ok(node.capabilities.length > 0, `${node.type} has no capabilities`);
    assert.ok(node.limitations.length > 0, `${node.type} has no limitations`);
    assert.ok(node.portRules.length > 0, `${node.type} has no port rules`);
  }
});

test('assistant node catalog preserves live ports and assistant configurable fields', () => {
  const prompt = getAssistantNodeCatalog('textPrompt')[0];
  const generateImage = getAssistantNodeCatalog('generateImage')[0];
  const qr = getAssistantNodeCatalog('qrCode')[0];

  assert.ok(prompt?.ports.some((port) => port.id === 'text' && port.side === 'output'));
  assert.ok(prompt?.configurableFields.includes('text'));
  assert.ok(prompt?.configurableFields.includes('variables'));
  assert.ok(prompt?.portRules.some((rule) => rule.includes('variable-0')));
  assert.ok(generateImage?.ports.some((port) => port.id === 'prompt' && port.kind === 'text'));
  assert.ok(generateImage?.configurableFields.includes('prompt'));
  assert.ok(qr?.ports.some((port) => port.id === 'text' && port.kind === 'text' && port.side === 'input'));
  assert.ok(qr?.ports.some((port) => port.id === 'image' && port.kind === 'image' && port.side === 'output'));
  assert.deepEqual(qr?.configurableFields, ['title', 'content', 'contentMode']);
  assert.match(qr?.limitations.join(' ') ?? '', /нельзя заменять.*Generate image/u);
});

test('assistant node catalog reports verified availability and executable support', () => {
  const nodes = getAssistantNodeCatalog();
  const byType = new Map(nodes.map((node) => [node.type, node]));
  const serverTypes = nodes
    .filter((node) => node.execution === 'server')
    .map((node) => node.type);

  assert.deepEqual(serverTypes, [
    'textPrompt',
    'textConcat',
    'textGeneration',
    'textFormatter',
    'textSplitter',
    'structuredOutput',
    'imageToText',
    'qrCode',
    'generateImage',
    'exportImage',
  ]);
  assert.equal(byType.get('importImage')?.execution, 'boundary');
  assert.equal(byType.get('pipelineInput')?.execution, 'boundary');
  assert.equal(byType.get('pipelineOutput')?.execution, 'boundary');
  assert.equal(byType.get('router')?.execution, 'transparent');
  assert.equal(byType.get('preview')?.execution, 'boundary');
  assert.equal(byType.get('referenceComposer')?.availability, 'hidden-incomplete');
  assert.match(byType.get('referenceComposer')?.limitations.join(' ') ?? '', /нет в меню добавления/u);
  assert.ok(nodes
    .filter((node) => node.type !== 'referenceComposer')
    .every((node) => node.availability === 'addable'));
});

test('assistant node catalog gives exact type, label and alias matches precedence', () => {
  assert.deepEqual(
    getAssistantNodeCatalog('textGeneration').map((node) => node.type),
    ['textGeneration'],
  );
  assert.deepEqual(
    getAssistantNodeCatalog('Preview').map((node) => node.type),
    ['preview'],
  );
  assert.deepEqual(
    getAssistantNodeCatalog('remove bg').map((node) => node.type),
    ['removeBackground'],
  );
  assert.deepEqual(
    getAssistantNodeCatalog('сборка промпта').map((node) => node.type),
    ['textConcat', 'textGeneration'],
  );
  assert.deepEqual(
    getAssistantNodeCatalog('шаблон с переменными').map((node) => node.type),
    ['textPrompt'],
  );
  assert.deepEqual(
    getAssistantNodeCatalog('что такое нода Extract').map((node) => node.type),
    ['imageToText'],
  );
  assert.deepEqual(
    getAssistantNodeCatalog(buildNodeAskAiDraft('imageToText')).map((node) => node.type),
    ['imageToText'],
  );
});

test('assistant node catalog keeps fuzzy search bounded and fails open to the registry', () => {
  const allNodes = getAssistantNodeCatalog();
  const concat = getAssistantNodeCatalog('склеивание текста с разделителем');

  assert.deepEqual(concat.map((node) => node.type), ['textConcat']);
  assert.match(concat[0]?.description ?? '', /несколько текстовых входов/u);
  assert.ok(concat[0]?.portRules.some((rule) => rule.includes('text-2')));
  assert.equal(getAssistantNodeCatalog('все доступные ноды').length, allNodes.length);
  assert.equal(getAssistantNodeCatalog('абракадабра xyzzy').length, allNodes.length);
});
