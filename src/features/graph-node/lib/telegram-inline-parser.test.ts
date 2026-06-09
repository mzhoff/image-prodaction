import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTelegramInlineText } from './telegram-inline-parser.ts';

test('parseTelegramInlineText splits simple markdown token', () => {
  const tokens = parseTelegramInlineText('Привет, _курсив_ и **жирный**');

  assert.deepEqual(tokens, [
    { type: 'text', content: 'Привет, ' },
    { type: 'italic', content: 'курсив' },
    { type: 'text', content: ' и ' },
    { type: 'bold', content: 'жирный' },
  ]);
});

test('parseTelegramInlineText parses hashtags and links', () => {
  const tokens = parseTelegramInlineText('Смотрите [доклад](https://example.com) #новость');

  assert.deepEqual(tokens, [
    { type: 'text', content: 'Смотрите ' },
    { type: 'link', content: 'доклад', href: 'https://example.com' },
    { type: 'text', content: ' ' },
    { type: 'hashtag', content: '#новость' },
  ]);
});

test('parseTelegramInlineText keeps nested content unprocessed inside style wrappers', () => {
  const tokens = parseTelegramInlineText('**жирный _курсив_**');

  assert.deepEqual(tokens, [
    { type: 'bold', content: 'жирный _курсив_' },
  ]);
});
