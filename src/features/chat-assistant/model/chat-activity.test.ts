import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolLifecycleEvent } from '@prodactionpro/chat-domain';
import { describeToolActivity, formatChatElapsed, normalizeChatActivityLabel } from './chat-activity.ts';

test('formats elapsed time and the initial assistant activity', () => {
  assert.equal(formatChatElapsed(0), '0:00');
  assert.equal(formatChatElapsed(65_900), '1:05');
  assert.equal(normalizeChatActivityLabel('Отправляю запрос'), 'Анализирую запрос');
});

test('maps real tool lifecycle events to product-facing progress', () => {
  const event = {
    conversationId: 'conversation-1',
    eventId: 'event-1',
    status: 'running',
    timestamp: '2026-08-12T00:00:00.000Z',
    toolCallId: 'tool-1',
    toolName: 'knowledge_search',
  } satisfies ToolLifecycleEvent;

  assert.equal(describeToolActivity(event), 'Ищу информацию в базе знаний');
});
