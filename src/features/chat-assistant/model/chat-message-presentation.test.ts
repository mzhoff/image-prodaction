import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextMessage } from '@prodactionpro/chat-domain';
import { prepareChatMessagesForPresentation } from './chat-message-presentation.ts';

test('assistant text is rendered as markdown and only the latest answer animates', () => {
  const firstAssistantMessage = createTextMessage({ content: '**Первый** ответ', role: 'assistant' });
  const userMessage = createTextMessage({ content: 'Следующий вопрос', role: 'user' });
  const latestAssistantMessage = createTextMessage({ content: '**Второй** ответ', role: 'assistant' });

  const prepared = prepareChatMessagesForPresentation([
    firstAssistantMessage,
    userMessage,
    latestAssistantMessage,
  ]);

  assert.deepEqual(prepared[0]?.blocks, [{ content: '**Первый** ответ', type: 'markdown' }]);
  assert.equal(prepared[0]?.metadata?.animate, undefined);
  assert.equal(prepared[1], userMessage);
  assert.deepEqual(prepared[2]?.blocks, [{ content: '**Второй** ответ', type: 'markdown' }]);
  assert.equal(prepared[2]?.metadata?.animate, true);
});

test('an earlier answer does not restart its animation while the user is last', () => {
  const assistantMessage = createTextMessage({ content: 'Ответ', role: 'assistant' });
  const userMessage = createTextMessage({ content: 'Новый вопрос', role: 'user' });

  const prepared = prepareChatMessagesForPresentation([assistantMessage, userMessage]);

  assert.equal(prepared[0]?.metadata?.animate, undefined);
});
