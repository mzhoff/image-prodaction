import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNodeAskAiDraft,
  NODE_HELP_METADATA,
} from './node-help.ts';
import {
  getNodeDefinition,
  PRODUCTION_NODE_TYPES,
} from './node-registry.ts';
import { createDefaultNode } from './create-default-node';
import { getNodePorts } from './node-definitions';
import { MAX_SPEECH_TEXT_CHARACTERS } from '@/shared/media/speech-text';

test('node help metadata is an exact complete record for all production node types', () => {
  assert.deepEqual(Object.keys(NODE_HELP_METADATA), PRODUCTION_NODE_TYPES);
  assert.equal(Object.keys(NODE_HELP_METADATA).length, 35);
});

test('Splitter help explains persistent slots and empty outputs', () => {
  const help = NODE_HELP_METADATA.textSplitter;
  assert.match(help.capabilities.join(' '), /item-N.*именем раздела/);
  assert.match(help.portRules.join(' '), /пустой текст.*соседнего слоя/);
  assert.match(help.limitations.join(' '), /списки без заголовков остаются позиционными/);
});

test('voice auditions and compact video placeholders are explained without promising unrecorded samples', () => {
  assert.match(NODE_HELP_METADATA.textToSpeech.capabilities.join(' '), /Play.*заранее записанный.*без платной генерации/);
  assert.match(NODE_HELP_METADATA.textToSpeech.limitations.join(' '), /Пока образец не опубликован, Play недоступен/);
  assert.match(NODE_HELP_METADATA.generateVideo.capabilities.join(' '), /плейсхолдер.*без отдельного большого блока статусов/);
  assert.match(NODE_HELP_METADATA.generateVideo.capabilities.join(' '), /Generate остаётся.*HTTP-коды/);
});

test('Extract help and default registry agree on the wire-create image input', () => {
  const node = createDefaultNode('imageToText', { x: 0, y: 0 });
  assert.deepEqual(getNodeDefinition('imageToText').ports, getNodePorts(node));
  assert.match(NODE_HELP_METADATA.imageToText.portRules.join(' '), /протянутого image-выхода.*Image 1 \(image-0\)/);
});

test('Import help distinguishes canvas thumbnail from original image dataflow', () => {
  assert.match(NODE_HELP_METADATA.importImage.capabilities.join(' '), /WebP-миниатюру до 560 px/);
  assert.match(NODE_HELP_METADATA.importImage.capabilities.join(' '), /image-порты используют оригинал/);
});

test('color correction help describes shared fullscreen controls without inventing runtime support', () => {
  for (const type of ['adjustment', 'curves'] as const) {
    assert.match(NODE_HELP_METADATA[type].capabilities.join(' '), /справа/);
    assert.match(NODE_HELP_METADATA[type].capabilities.join(' '), /узком экране/);
    assert.equal(NODE_HELP_METADATA[type].execution, 'canvas-only');
  }
  assert.match(NODE_HELP_METADATA.adjustment.capabilities.join(' '), /Open image/);
  assert.match(NODE_HELP_METADATA.curves.capabilities.join(' '), /маски остаются снизу/);
});

test('text fragment help agrees on ordinary Prompt, top badges and safe moves', () => {
  const help = JSON.stringify(NODE_HELP_METADATA.textPrompt);
  assert.match(help, /presentation=card/);
  assert.match(help, /над текстовым полем/);
  assert.match(help, /пустая исходная Prompt и её связи удаляются/);
  assert.match(help, /частичный перенос.*сохраняют источник/);
  assert.match(JSON.stringify(NODE_HELP_METADATA.textFormatter), /сохраняя прежние стили/);
  assert.match(help, /Совпадающие целиком/);
  assert.match(help, /Alt/);
  assert.match(help, /Undo/);
  assert.match(help, /@переменные/);
  assert.match(JSON.stringify(NODE_HELP_METADATA.imageToText), /Кнопка переносит заголовок/);
});

test('Generate Image help describes lossless transport and distinct app/provider ceilings', () => {
  const help = JSON.stringify(NODE_HELP_METADATA.generateImage);
  assert.match(help, /WebP без потерь/);
  assert.match(help, /без уменьшения разрешения/);
  assert.match(help, /30 МиБ/);
  assert.match(help, /20 МБ.*base64/);
  assert.match(help, /Оригинал в проекте не меняется/);
  assert.match(help, /Reference \(reference\) и Style \(style\) — разные входы/);
});

test('Generate Video help explains exclusive modes, settings contract and a usable graph recipe', () => {
  const help = NODE_HELP_METADATA.generateVideo;
  assert.match(help.capabilities.join(' '), /text использует только prompt.*frames.*first-frame.*references.*reference-1\.\.3/u);
  assert.match(help.portRules.join(' '), /mode=text.*mode=frames.*mode=references/u);
  assert.match(help.portRules.join(' '), /model:string.*aspectRatio:string.*referenceDescriptions:string/u);
  assert.match(help.portRules.join(' '), /textPrompt\.text -> generateVideo\.prompt.*generateVideo\.video -> pipelineOutput/u);
  assert.match(help.capabilities.join(' '), /без технического имени gateway\/provider/u);
});

test('Export help separates local carousel selection from canonical output and batch download', () => {
  const help = NODE_HELP_METADATA.exportImage;
  assert.match(help.capabilities.join(' '), /стрелки на hover.*счётчиком/);
  assert.match(help.capabilities.join(' '), /Download ZIP.*весь набор/);
  assert.match(help.capabilities.join(' '), /Save current to Library.*выбранным/);
  assert.match(help.capabilities.join(' '), /title Export-ноды.*новый ID скачивания.*порядковый номер/);
  assert.match(help.limitations.join(' '), /не переименовывают исходники в Library/);
  assert.match(help.limitations.join(' '), /не меняет выход image.*Undo.*не является MCP setting/);
  assert.match(help.portRules.join(' '), /первый преобразованный/);
});

test('Ask AI draft uses only the canonical label and type for every node', () => {
  for (const type of PRODUCTION_NODE_TYPES) {
    const label = getNodeDefinition(type).menuLabel;
    assert.equal(
      buildNodeAskAiDraft(type),
      `Расскажи, что такое нода «${label}» (тип ${type}) в Image Production, для чего она нужна и когда её использовать. Объясни её входы, выходы и ключевые настройки, перечисли возможности и ограничения, затем приведи короткий пример связки с другими нодами. Используй актуальный node_catalog. Ничего не изменяй в текущем документе — нужен только ответ.`,
    );
  }
});

test('Ask AI draft contains no node instance data or identifier', () => {
  const draft = buildNodeAskAiDraft('imageToText');

  assert.match(draft, /нода «Extract» \(тип imageToText\)/u);
  assert.doesNotMatch(draft, /node-[a-z0-9]|sourceId|nodeId|assetId|настройки текущей ноды/iu);
});

test('audio help describes exact dataflow and does not promise speaker labels or automatic recognition', () => {
  assert.match(NODE_HELP_METADATA.speechToText.portRules.join(' '), /Вход audio.*выход text/u);
  assert.match(NODE_HELP_METADATA.audioConvert.portRules.join(' '), /Вход source.*выход audio/u);
  assert.match(NODE_HELP_METADATA.textToSpeech.portRules.join(' '), /Вход text.*выход audio/u);
  assert.match(NODE_HELP_METADATA.importImage.portRules.join(' '), /ID выходного порта — image.*kind.*image или audio/u);
  assert.match(NODE_HELP_METADATA.importImage.limitations.join(' '), /sourceAttachmentIndex.*только изображение/u);
  assert.match(NODE_HELP_METADATA.speechToText.limitations.join(' '), /Не возвращает разметку говорящих.*тайм-коды/u);
  assert.match(NODE_HELP_METADATA.speechToText.capabilities.join(' '), /Gemini 3.1 Flash Lite.*Auto.*только для чтения/u);
  assert.match(NODE_HELP_METADATA.audioConvert.capabilities.join(' '), /без вызова AI/u);
  assert.equal(NODE_HELP_METADATA.textToSpeech.execution, 'server');
});

test('Ask AI explains actual video ports, track selection, preparation and the immutable source boundary', () => {
  const help = NODE_HELP_METADATA.importImage;
  const base = createDefaultNode('importImage', { x: 0, y: 0 });
  const ports = getNodePorts({ ...base, data: { title: 'Import', mediaKind: 'video' } });
  assert.deepEqual(ports.map(({ id, kind }) => ({ id, kind })), [
    { id: 'original', kind: 'video' }, { id: 'video', kind: 'video' }, { id: 'audio', kind: 'audio' },
  ]);
  assert.match(help.portRules.join(' '), /original.*video со звуком.*video.*video без звука.*audio.*audio-дорожку/u);
  assert.match(help.portRules.join(' '), /videoAudioTrackIndex.*существующий индекс/u);
  assert.match(help.portRules.join(' '), /importImage\.audio -> speechToText\.audio/u);
  assert.match(help.portRules.join(' '), /Pipeline Output с kind video.*Входа у Import нет/u);
  assert.match(help.limitations.join(' '), /Без звука нельзя подготовить аудиовыход/u);
  assert.match(help.limitations.join(' '), /Не распознаёт речь автоматически и не отделяет голос от музыки/u);
  assert.match(help.capabilities.join(' '), /video\.import.*только подключённых выходов/u);
});

test('Voice help matches long-text bound, final artifact and paid recovery rather than advertising voice cloning', () => {
  const help = NODE_HELP_METADATA.textToSpeech;
  assert.match(help.limitations.join(' '), new RegExp(`${MAX_SPEECH_TEXT_CHARACTERS} символами`));
  assert.match(help.limitations.join(' '), /не больше 5000 символов.*20 MiB/u);
  assert.match(help.capabilities.join(' '), /делится на сервере.*одну MP3-дорожку.*слова и порядок/u);
  assert.match(help.limitations.join(' '), /Каждая часть.*платный вызов.*Неопределённый ответ.*не повторяется вслепую/u);
  assert.match(help.limitations.join(' '), /не распознавание или копирование голоса/u);
});

test('Crop help distinguishes video server processing from legacy image cropping and states real ports', () => {
  const help = NODE_HELP_METADATA.cropImage;
  assert.match(help.summary, /изображение или видео/);
  assert.match(help.portRules.join(' '), /videoResult.*reverieStories.video/);
  assert.match(help.limitations.join(' '), /ровно один источник/);
  assert.match(help.limitations.join(' '), /Image-вариант не исполняется в server runtime/);
  assert.match(help.capabilities.join(' '), /Обрезать видео/);
});

test('all model selectors explain account scope, independent tabs, favorite order and explicit model choice', () => {
  for (const type of ['generateImage', 'generateVideo', 'textGeneration', 'textToSpeech', 'speechToText', 'refineImage', 'imageToText', 'referenceComposer', 'subjectBuilder'] as const) {
    const help = NODE_HELP_METADATA[type];
    assert.match(help.capabilities.join(' '), /All.*A–Z.*Most popular.*аккаунта.*Favorite/);
    assert.match(help.capabilities.join(' '), /отдельно для текста, изображений, видео и аудио/);
    assert.match(help.limitations.join(' '), /Auto Router исключён/);
    assert.match(help.limitations.join(' '), /не являются settings ноды/);
  }
});
