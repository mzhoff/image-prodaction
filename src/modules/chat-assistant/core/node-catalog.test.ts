import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNodeAskAiDraft } from '@/entities/production-graph/model/node-help';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import { getAssistantNodeCatalog } from './node-catalog.ts';

test('assistant node catalog exposes complete product-owned help for the live registry', () => {
  const nodes = getAssistantNodeCatalog();

  assert.deepEqual(nodes.map((node) => node.type), PRODUCTION_NODE_TYPES);
  assert.equal(nodes.length, 35);
  for (const node of nodes) {
    assert.ok(node.aliases.length > 0, `${node.type} has no aliases`);
    assert.ok(node.description.length > 0, `${node.type} has no description`);
    assert.ok(node.capabilities.length > 0, `${node.type} has no capabilities`);
    assert.ok(node.limitations.length > 0, `${node.type} has no limitations`);
    assert.ok(node.portRules.length > 0, `${node.type} has no port rules`);
  }
});

test('catalog exposes stable Splitter routing but not internal identity settings', () => {
  const splitter = getAssistantNodeCatalog('textSplitter')[0];
  assert.match(splitter.portRules.join(' '), /сохранённые слоты/);
  assert.match(splitter.capabilities.join(' '), /пустой выход/);
  assert.ok(!splitter.configurableFields.includes('itemKeys'));
});

test('agent catalogue advertises read-only recorded auditions and compact video feedback', () => {
  const voice = getAssistantNodeCatalog('textToSpeech')[0];
  assert.match(voice.capabilities.join(' '), /Play.*без платной генерации/);
  assert.match(voice.limitations.join(' '), /Пока образец не опубликован/);
  assert.ok(!voice.configurableFields.some((field) => /preview/i.test(field)));
  assert.match(getAssistantNodeCatalog('generateVideo')[0].capabilities.join(' '), /плейсхолдер/);
  assert.match(getAssistantNodeCatalog('generateVideo')[0].capabilities.join(' '), /Crop.*Export.*сервер/);
});

test('live catalog explains the fullscreen color panels from the same node help', () => {
  for (const type of ['adjustment', 'curves'] as const) {
    assert.match(getAssistantNodeCatalog(type)[0].capabilities.join(' '), /справа/);
  }
});

test('assistant node catalog preserves live ports and assistant configurable fields', () => {
  const prompt = getAssistantNodeCatalog('textPrompt')[0];
  const pipelineInput = getAssistantNodeCatalog('pipelineInput')[0];
  const pipelineOutput = getAssistantNodeCatalog('pipelineOutput')[0];
  const generateImage = getAssistantNodeCatalog('generateImage')[0];
  const extract = getAssistantNodeCatalog('imageToText')[0];
  const exportImage = getAssistantNodeCatalog('exportImage')[0];
  const qr = getAssistantNodeCatalog('qrCode')[0];

  assert.ok(prompt?.ports.some((port) => port.id === 'text' && port.side === 'output'));
  assert.ok(prompt?.configurableFields.includes('text'));
  assert.ok(prompt?.configurableFields.includes('variables'));
  assert.ok(prompt?.portRules.some((rule) => rule.includes('variable-0')));
  assert.ok(prompt?.portRules.some((rule) => rule.includes('pipelineInput.field:<id>')));
  assert.match(pipelineInput?.portRules.join(' ') ?? '', /textPrompt\.variable-N.*@fieldKey/u);
  assert.match(pipelineOutput?.portRules.join(' ') ?? '', /exportImage\.image/u);
  assert.ok(generateImage?.ports.some((port) => port.id === 'prompt' && port.kind === 'text'));
  assert.ok(generateImage?.configurableFields.includes('prompt'));
  assert.deepEqual(extract.ports.filter((port) => port.side === 'input'), [
    { id: 'image-0', label: 'Image 1', kind: 'image', side: 'input' },
  ]);
  assert.match(extract.portRules.join(' '), /протянутого image-выхода.*image-0/);
  assert.ok(exportImage?.ports.some((port) => (
    port.id === 'image' && port.kind === 'image' && port.side === 'output'
  )));
  assert.match(exportImage?.portRules.join(' ') ?? '', /image-0.*output image/u);
  assert.match(exportImage?.capabilities.join(' ') ?? '', /стрелки на hover/);
  assert.match(exportImage?.capabilities.join(' ') ?? '', /title Export-ноды.*новый ID скачивания/);
  assert.match(exportImage?.limitations.join(' ') ?? '', /не меняет выход image/);
  assert.ok(!exportImage?.configurableFields.includes('activeIndex'));
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
    'textToSpeech',
    'speechToText',
    'audioConvert',
    'timelineHandoff',
    'reverieStories',
    'generateVideo',
    'textFormatter',
    'textSplitter',
    'structuredOutput',
    'imageToText',
    'qrCode',
    'generateImage',
    'cropImage',
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

test('audio catalog exposes separate recognition, voice and conversion with safe editable settings', () => {
  const stt = getAssistantNodeCatalog('speechToText')[0];
  const convert = getAssistantNodeCatalog('audioConvert')[0];
  const voice = getAssistantNodeCatalog('textToSpeech')[0];
  assert.deepEqual(getAssistantNodeCatalog('расшифровка').map((node) => node.type), ['speechToText']);
  assert.deepEqual(stt?.configurableFields, ['title', 'model', 'language']);
  assert.deepEqual(convert?.configurableFields, ['title', 'format', 'bitrateKbps', 'sampleRateHz', 'channels']);
  assert.ok(convert?.ports.some((port) => port.id === 'source' && port.side === 'input' && port.kind === 'audio'));
  assert.ok(convert?.ports.some((port) => port.id === 'audio' && port.side === 'output' && port.kind === 'audio'));
  assert.ok(stt?.ports.some((port) => port.id === 'text' && port.side === 'output' && port.kind === 'text'));
  assert.ok(voice?.ports.some((port) => port.id === 'audio' && port.side === 'output' && port.kind === 'audio'));
  for (const node of [stt, convert, voice]) {
    assert.equal(node?.execution, 'server');
    assert.equal(new Set<string>(node?.configurableFields).has('audioAssetId'), false);
  }
});

test('catalog exposes video track control without allowing authored assets and describes durable long Voice', () => {
  const imported = getAssistantNodeCatalog('importImage')[0]!;
  const voice = getAssistantNodeCatalog('textToSpeech')[0]!;
  assert.deepEqual(imported.configurableFields, ['title', 'videoAudioTrackIndex']);
  assert.match(imported.portRules.join(' '), /original.*video.*audio.*videoAudioTrackIndex/u);
  assert.match(imported.capabilities.join(' '), /video\.import.*только подключённых выходов/u);
  assert.match(imported.limitations.join(' '), /100 MiB.*30 минут/u);
  assert.match(voice.limitations.join(' '), /30000 символами.*30 минутами/u);
  assert.match(voice.capabilities.join(' '), /фоновой очереди.*после перезагрузки/u);
  assert.match(voice.capabilities.join(' '), /одну MP3-дорожку/u);
  for (const field of ['speechRequest', 'assetId', 'videoAudioAssetId', 'videoOnlyAssetId']) {
    assert.equal(imported.configurableFields.includes(field), false);
    assert.equal(voice.configurableFields.includes(field), false);
  }
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

test('agent catalog explains personal model lists without exposing them as node settings', () => {
  for (const type of ['generateImage', 'generateVideo', 'textGeneration', 'textToSpeech'] as const) {
    const node = getAssistantNodeCatalog(type)[0];
    assert.match(node.capabilities.join(' '), /Most popular.*аккаунта/);
    assert.match(node.limitations.join(' '), /не управляются через MCP/);
    assert.ok(!node.configurableFields.some((field) => ['favorites', 'tab', 'popularity'].includes(field)));
  }
});
