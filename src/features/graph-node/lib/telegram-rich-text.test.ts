import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TELEGRAM_TEXT_FORMAT,
  TELEGRAM_TEXT_STYLE,
  createTelegramEditorValueFromSegments,
  getPlainTextFromTelegramRichText,
  getTelegramRichTextBlocks,
  getTelegramRichTextRunText,
  parseTelegramFormatSegmentsPayload,
} from './telegram-rich-text.ts';

test('createTelegramEditorValueFromSegments preserves source text exactly after normalization', () => {
  const sourceText = [
    'Предприниматель не равно «человек-оркестр».',
    '',
    'Бизнес должен работать на вас, а не вы на него.',
    '',
    '#операционка #системаБизнесе',
  ].join('\n');
  const formatted = createTelegramEditorValueFromSegments(sourceText, [
    { text: 'Предприниматель', formats: ['bold'] },
    { text: ' не равно «человек-оркестр».' },
    { text: '\n\nБизнес', formats: ['italic'] },
    { text: ' должен работать на вас, а не вы на него.' },
    { text: '\n\n#операционка #системаБизнесе' },
  ]);

  assert.equal(formatted.plainText, sourceText);
  assert.equal(getPlainTextFromTelegramRichText(formatted.richText), sourceText);
});

test('createTelegramEditorValueFromSegments rejects changed text', () => {
  assert.throws(() => {
    createTelegramEditorValueFromSegments('Оригинальный текст', [
      { text: 'Измененный текст', formats: ['bold'] },
    ]);
  }, /changed the source text/);
});

test('parseTelegramFormatSegmentsPayload repairs raw control characters inside model JSON strings', () => {
  const sourceText = 'Первая строка\nвторая строка.\n\n#бизнес';
  const modelPayload = `{
    "segments": [
      { "text": "Первая строка
вторая строка.", "formats": ["bold"] },
      { "text": "\\n\\n#бизнес", "formats": [] }
    ]
  }`;
  const segments = parseTelegramFormatSegmentsPayload(modelPayload);
  const formatted = createTelegramEditorValueFromSegments(sourceText, segments);

  assert.equal(formatted.plainText, sourceText);
  assert.equal(getPlainTextFromTelegramRichText(formatted.richText), sourceText);
});

test('getTelegramRichTextBlocks keeps formatting on exact text nodes, not entire paragraph textFormat', () => {
  const plainText = 'Предприниматель не равно «человек-оркестр». Но почему-то многие продолжают тащить всё на себе.';
  const richText = JSON.stringify({
    root: {
      children: [{
        children: [
          {
            detail: 0,
            format: TELEGRAM_TEXT_FORMAT.bold,
            mode: 'normal',
            style: '',
            text: 'Предприниматель',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' не равно «человек-оркестр». Но почему-то многие продолжают тащить всё на себе.',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        textFormat: TELEGRAM_TEXT_FORMAT.bold,
        textStyle: '',
        type: 'paragraph',
        version: 1,
      }],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
  const blocks = getTelegramRichTextBlocks(plainText, richText);

  assert.ok(blocks);
  assert.equal(blocks.length, 1);
  assert.equal(getTelegramRichTextRunText(blocks[0].runs), plainText);
  assert.deepEqual(blocks[0].runs.map((run) => run.format), [TELEGRAM_TEXT_FORMAT.bold, 0]);
});

test('getTelegramRichTextBlocks renders editor state even when plain backup is stale', () => {
  const richText = JSON.stringify({
    root: {
      children: [{
        children: [
          {
            detail: 0,
            format: TELEGRAM_TEXT_FORMAT.bold,
            mode: 'normal',
            style: '',
            text: 'Актуальный',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' текст редактора',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        type: 'paragraph',
        version: 1,
      }],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
  const blocks = getTelegramRichTextBlocks('Старый plain backup', richText);

  assert.ok(blocks);
  assert.equal(getTelegramRichTextRunText(blocks[0].runs), 'Актуальный текст редактора');
  assert.deepEqual(blocks[0].runs.map((run) => run.format), [TELEGRAM_TEXT_FORMAT.bold, 0]);
});

test('getTelegramRichTextBlocks accepts string text format names from serialized editors', () => {
  const richText = JSON.stringify({
    root: {
      children: [{
        children: [
          {
            detail: 0,
            format: 'bold italic strikethrough',
            mode: 'normal',
            style: '',
            text: 'Фрагмент',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        type: 'paragraph',
        version: 1,
      }],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
  const blocks = getTelegramRichTextBlocks('Фрагмент', richText);

  assert.ok(blocks);
  assert.equal(blocks[0].runs[0].format, TELEGRAM_TEXT_FORMAT.bold | TELEGRAM_TEXT_FORMAT.italic | TELEGRAM_TEXT_FORMAT.strike);
});

test('getTelegramRichTextBlocks keeps Telegram custom styles on exact text runs', () => {
  const link = 'https://example.com/post';
  const richText = JSON.stringify({
    root: {
      children: [{
        children: [
          {
            detail: 0,
            format: TELEGRAM_TEXT_FORMAT.bold,
            mode: 'normal',
            style: `${TELEGRAM_TEXT_STYLE.link}: ${encodeURIComponent(link)}; ${TELEGRAM_TEXT_STYLE.spoiler}: 1; ${TELEGRAM_TEXT_STYLE.quote}: 1;`,
            text: 'Фрагмент',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        type: 'paragraph',
        version: 1,
      }],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
  const blocks = getTelegramRichTextBlocks('Фрагмент', richText);

  assert.ok(blocks);
  assert.equal(blocks[0].runs[0].format, TELEGRAM_TEXT_FORMAT.bold);
  assert.equal(blocks[0].runs[0].link, link);
  assert.equal(blocks[0].runs[0].spoiler, true);
  assert.equal(blocks[0].runs[0].quote, true);
});

test('getTelegramRichTextBlocks keeps quote metadata across nested bold and plain runs', () => {
  const plainText = 'Главная ловушка - пытаться внедрить все и сразу.';
  const richText = JSON.stringify({
    root: {
      children: [{
        children: [
          {
            detail: 0,
            format: TELEGRAM_TEXT_FORMAT.bold,
            mode: 'normal',
            style: `${TELEGRAM_TEXT_STYLE.quote}: 1;`,
            text: 'Главная ловушка',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: `${TELEGRAM_TEXT_STYLE.quote}: 1;`,
            text: ' - пытаться внедрить все и сразу.',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        type: 'paragraph',
        version: 1,
      }],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
  const blocks = getTelegramRichTextBlocks(plainText, richText);

  assert.ok(blocks);
  assert.equal(getTelegramRichTextRunText(blocks[0].runs), plainText);
  assert.deepEqual(blocks[0].runs.map((run) => run.quote), [true, true]);
  assert.deepEqual(blocks[0].runs.map((run) => run.format), [TELEGRAM_TEXT_FORMAT.bold, 0]);
});
