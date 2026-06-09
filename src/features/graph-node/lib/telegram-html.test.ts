import assert from 'node:assert/strict';
import test from 'node:test';
import {
  toTelegramHtmlForClipboard,
  toTelegramHtmlFromEditor,
  toTelegramPlainTextForClipboard,
} from './telegram-html.ts';

test('toTelegramHtmlFromEditor keeps paragraphs on single newline boundary', () => {
  const messageRichText = JSON.stringify({
    root: {
      children: [
        {
          children: [{
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Первая строка',
            type: 'text',
            version: 1,
          }],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
        {
          children: [{
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Вторая строка',
            type: 'text',
            version: 1,
          }],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });

  const content = toTelegramHtmlFromEditor({
    messageText: 'ignored',
    messageRichText,
  });

  assert.equal(content, 'Первая строка\nВторая строка');
});

test('toTelegramHtmlFromEditor keeps empty paragraph as a visible blank line', () => {
  const messageRichText = JSON.stringify({
    root: {
      children: [
        {
          children: [{
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Первая строка',
            type: 'text',
            version: 1,
          }],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
        {
          children: [],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
        {
          children: [{
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Вторая строка',
            type: 'text',
            version: 1,
          }],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          version: 1,
          type: 'paragraph',
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });

  const content = toTelegramHtmlFromEditor({
    messageText: '',
    messageRichText,
  });

  assert.equal(content, 'Первая строка\n\nВторая строка');
});

test('toTelegramHtmlFromEditor keeps plain fallback newlines when rich text is missing', () => {
  const content = toTelegramHtmlFromEditor({
    messageText: 'Пороговая строка\n\nФинальная строка',
    messageRichText: '',
  });

  assert.equal(content, 'Пороговая строка\n\nФинальная строка');
});

test('toTelegramHtmlFromEditor keeps plain fallback quote marker as blockquote', () => {
  const content = toTelegramHtmlFromEditor({
    messageText: '> Цитата',
    messageRichText: undefined,
  });

  assert.equal(content, '<blockquote>Цитата</blockquote>');
});

test('toTelegramHtmlForClipboard converts markdown-like inline formatting for fallback mode', () => {
  const content = toTelegramHtmlForClipboard({
    messageText: '**Жирный** и _курсив_ и ~~зачер~~ и `код` и __подч__ и ||спойлер|| и [ссылка](https://example.com)',
    messageRichText: '',
  });

  assert.equal(
    content,
    '<b>Жирный</b> и <i>курсив</i> и <s>зачер</s> и <code>код</code> и <u>подч</u> и <tg-spoiler>спойлер</tg-spoiler> и <a href="https://example.com">ссылка</a>',
  );
});

test('toTelegramHtmlForClipboard keeps quote block in fallback mode', () => {
  const content = toTelegramHtmlForClipboard({
    messageText: 'Обычный текст\n> Цитата',
    messageRichText: undefined,
  });

  assert.equal(
    content,
    'Обычный текст\n<blockquote>Цитата</blockquote>',
  );
});

test('toTelegramPlainTextForClipboard returns plain text from rich payload', () => {
  const messageRichText = JSON.stringify({
    root: {
      children: [
        {
          children: [
            { detail: 0, format: 1, mode: 'normal', style: '', text: 'Привет', type: 'text', version: 1 },
            { mode: 'normal', type: 'linebreak', version: 1 },
            { detail: 0, format: 0, mode: 'normal', style: '', text: 'Мир', type: 'text', version: 1 },
          ],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
        {
          children: [{
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Второй',
            type: 'text',
            version: 1,
          }],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });

  const content = toTelegramPlainTextForClipboard({
    messageText: '',
    messageRichText,
  });

  assert.equal(content, 'Привет\nМир\nВторой');
});
