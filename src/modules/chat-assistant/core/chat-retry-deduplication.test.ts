import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentModelMessage } from '@prodactionpro/chat-connectors';
import { collapseConsecutiveDuplicateAgentUserMessages } from './chat-retry-deduplication.ts';

test('collapses consecutive copies of the same failed user prompt', () => {
  const messages: AgentModelMessage[] = [
    { content: 'Системная инструкция', role: 'system' },
    { content: 'Доработай этот пайплайн', role: 'user' },
    { content: '  Доработай   этот пайплайн ', role: 'user' },
  ];

  assert.deepEqual(collapseConsecutiveDuplicateAgentUserMessages(messages), [
    messages[0],
    messages[2],
  ]);
});

test('preserves repeated prompts separated by an assistant answer', () => {
  const messages: AgentModelMessage[] = [
    { content: 'Повтори', role: 'user' },
    { content: 'Первый ответ', role: 'assistant' },
    { content: 'Повтори', role: 'user' },
  ];

  assert.deepEqual(collapseConsecutiveDuplicateAgentUserMessages(messages), messages);
});

test('preserves tool messages between user prompts', () => {
  const messages: AgentModelMessage[] = [
    { content: 'Проверь граф', role: 'user' },
    { content: '{"nodes":[]}', name: 'document_graph', role: 'tool', toolCallId: 'call-1' },
    { content: 'Проверь граф', role: 'user' },
  ];

  assert.deepEqual(collapseConsecutiveDuplicateAgentUserMessages(messages), messages);
});
