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

test('access refusal is presented once outside history, preserving persisted user turns', () => {
  const persisted = createTextMessage({ role: 'user', content: 'Сохранённый запрос' });
  const optimistic = createTextMessage({ role: 'user', content: 'Новый запрос' });
  optimistic.metadata = { optimistic: true };
  const refusal = createTextMessage({ role: 'assistant', content: 'AI-бюджет не активирован' });
  refusal.metadata = { runtimeError: true, errorCode: 'CHAT_WORKSPACE_PROVIDER_REQUIRED' };
  assert.deepEqual(prepareChatMessagesForPresentation([persisted, optimistic, refusal]), [persisted]);
  assert.deepEqual(prepareChatMessagesForPresentation([persisted, refusal]), [persisted]);
});

test('ordinary connection failures remain visible and do not erase the user message', () => {
  const user = createTextMessage({ role: 'user', content: 'Сохраните запрос' });
  user.metadata = { optimistic: true };
  const failure = createTextMessage({ role: 'assistant', content: 'Соединение прервано' });
  failure.metadata = { runtimeError: true, errorCode: 'CHAT_STREAM_FAILED' };
  assert.equal(prepareChatMessagesForPresentation([user, failure]).length, 2);
});
