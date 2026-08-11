import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextMessage } from '@prodactionpro/chat-domain';
import { formatChatMessageTime, getChatMessageCopyText } from './chat-message-actions.ts';

test('copy text contains message content without author or timestamp metadata', () => {
  const message = createTextMessage({
    content: 'Текст сообщения',
    role: 'user',
  });

  assert.equal(getChatMessageCopyText(message), 'Текст сообщения');
});

test('copy text joins text and markdown blocks and ignores non-text artifacts', () => {
  const message = createTextMessage({ content: 'Первый блок', role: 'assistant' });
  message.blocks.push(
    { content: '**Второй блок**', type: 'markdown' },
    { alt: 'Preview', type: 'image', url: 'https://example.com/image.png' },
  );

  assert.equal(getChatMessageCopyText(message), 'Первый блок\n\n**Второй блок**');
});

test('message time formatter is stable and rejects invalid dates', () => {
  const localDate = new Date(2026, 7, 11, 13, 39);

  assert.equal(formatChatMessageTime(localDate.toISOString()), '13:39');
  assert.equal(formatChatMessageTime('not-a-date'), '');
});
