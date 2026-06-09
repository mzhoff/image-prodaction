import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTelegramQuoteText,
  parseTelegramMessageBlocks,
  splitTelegramMessageParagraphs,
} from './telegram-message-blocks.ts';

test('parseTelegramMessageBlocks keeps empty lines and blank paragraphs', () => {
  const blocks = parseTelegramMessageBlocks('Первая строка\n\nВторая строка');

  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], { kind: 'paragraph', text: 'Первая строка' });
  assert.deepEqual(blocks[1], { kind: 'paragraph', text: '' });
  assert.deepEqual(blocks[2], { kind: 'paragraph', text: 'Вторая строка' });
});

test('parseTelegramMessageBlocks parses quoted block as quote', () => {
  const blocks = parseTelegramMessageBlocks('> Цитата');

  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0], { kind: 'quote', text: 'Цитата' });
});

test('parseTelegramMessageBlocks keeps lines with Windows newlines', () => {
  const blocks = parseTelegramMessageBlocks('Первая\r\n\r\nВторая');

  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], { kind: 'paragraph', text: 'Первая' });
  assert.deepEqual(blocks[1], { kind: 'paragraph', text: '' });
  assert.deepEqual(blocks[2], { kind: 'paragraph', text: 'Вторая' });
});

test('splitTelegramMessageParagraphs keeps leading empty paragraphs by default', () => {
  const paragraphs = splitTelegramMessageParagraphs('\r\n\r\nПервая');

  assert.equal(paragraphs.length, 2);
  assert.deepEqual(paragraphs, ['', 'Первая']);
});

test('splitTelegramMessageParagraphs can skip empty paragraphs', () => {
  const paragraphs = splitTelegramMessageParagraphs('Первая\r\n\r\n\r\nВторая', {
    removeEmptyParagraphs: true,
  });

  assert.equal(paragraphs.length, 2);
  assert.deepEqual(paragraphs, ['Первая', 'Вторая']);
});

test('getTelegramQuoteText strips quote marker only when all lines in block are quoted', () => {
  const allQuoted = getTelegramQuoteText('> Цитата\n> вторая строка');
  const mixed = getTelegramQuoteText('> Цитата\nобычный текст');

  assert.equal(allQuoted, 'Цитата\nвторая строка');
  assert.equal(mixed, '');
});
