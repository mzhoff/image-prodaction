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

test('the local recovery panel replaces the duplicated synthetic runtime error', () => {
  const userMessage = createTextMessage({ content: 'Повтори задачу', role: 'user' });
  const runtimeError = {
    ...createTextMessage({ content: 'placeholder', role: 'assistant' }),
    blocks: [{
      message: 'Chat request timed out',
      retryable: true,
      title: 'Не удалось отправить сообщение',
      type: 'error' as const,
    }],
  };

  const prepared = prepareChatMessagesForPresentation(
    [userMessage, runtimeError],
    { hideRuntimeErrors: true },
  );

  assert.deepEqual(prepared, [userMessage]);
});

test('the interactive tool panel replaces the persisted confirmation status block', () => {
  const userMessage = createTextMessage({ content: 'Собери пайплайн', role: 'user' });
  const confirmationStatus = {
    ...createTextMessage({ content: 'placeholder', role: 'assistant' }),
    blocks: [{
      description: 'pipeline_build изменит данные проекта.',
      label: 'Требуется подтверждение',
      status: 'needs-confirmation' as const,
      type: 'tool-status' as const,
    }],
  };

  const prepared = prepareChatMessagesForPresentation(
    [userMessage, confirmationStatus],
    { hideToolStatusBlocks: true },
  );

  assert.deepEqual(prepared, [userMessage]);
});

test('retry keeps one user bubble when the same failed prompt is submitted again', () => {
  const originalMessage = createTextMessage({ content: 'Доработай этот пайплайн', role: 'user' });
  const retryMessage = createTextMessage({ content: '  Доработай   этот пайплайн  ', role: 'user' });
  const runtimeError = {
    ...createTextMessage({ content: 'placeholder', role: 'assistant' }),
    blocks: [{
      message: 'network error',
      retryable: true,
      title: 'Не удалось отправить сообщение',
      type: 'error' as const,
    }],
  };

  const prepared = prepareChatMessagesForPresentation(
    [originalMessage, runtimeError, retryMessage],
    {
      collapseConsecutiveDuplicateUserMessages: true,
      hideRuntimeErrors: true,
    },
  );

  assert.deepEqual(prepared, [retryMessage]);
});

test('the same user text is preserved when an assistant answer separates the messages', () => {
  const firstMessage = createTextMessage({ content: 'Повтори', role: 'user' });
  const assistantMessage = createTextMessage({ content: 'Готово', role: 'assistant' });
  const secondMessage = createTextMessage({ content: 'Повтори', role: 'user' });

  const prepared = prepareChatMessagesForPresentation(
    [firstMessage, assistantMessage, secondMessage],
    { collapseConsecutiveDuplicateUserMessages: true },
  );

  assert.equal(prepared.length, 3);
  assert.equal(prepared[0], firstMessage);
  assert.equal(prepared[2], secondMessage);
});
