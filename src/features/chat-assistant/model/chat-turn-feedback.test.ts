import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextMessage, type ToolCallRecord } from '@prodactionpro/chat-domain';
import { canSafelyRetryChatTurn, getLatestUserPrompt } from './chat-turn-feedback.ts';

test('allows retry after a timeout when no mutating action started', () => {
  const message = createTextMessage({ content: 'Собери пайплайн', role: 'user' });
  message.createdAt = '2026-08-12T09:40:27.000Z';

  assert.equal(canSafelyRetryChatTurn({
    error: 'Chat request timed out after 135 seconds',
    messages: [message],
    toolCalls: [],
  }), true);
});

test('blocks retry for non-transient errors and after a mutating action was proposed', () => {
  const message = createTextMessage({ content: 'Собери пайплайн', role: 'user' });
  message.createdAt = '2026-08-12T09:40:27.000Z';
  const writeTool = {
    conversationId: 'conversation-1',
    createdAt: '2026-08-12T09:40:30.000Z',
    id: 'tool-1',
    riskLevel: 'write',
    status: 'needs-confirmation',
    toolName: 'pipeline_build',
    updatedAt: '2026-08-12T09:40:30.000Z',
  } satisfies ToolCallRecord;

  assert.equal(canSafelyRetryChatTurn({
    error: 'Model is not allowed',
    messages: [message],
    toolCalls: [],
  }), false);
  assert.equal(canSafelyRetryChatTurn({
    error: 'Chat request timed out after 135 seconds',
    messages: [message],
    toolCalls: [writeTool],
  }), false);
});

test('reuses the actual user prompt even when the first failed turn has no conversation yet', () => {
  const userMessage = createTextMessage({ content: 'Собери пайплайн для поста', role: 'user' });
  assert.equal(getLatestUserPrompt([userMessage]), 'Собери пайплайн для поста');
});

test('offers retry for the exact browser network error when only read tools ran', () => {
  const userMessage = createTextMessage({ content: 'Собирай pipeline', role: 'user' });
  assert.equal(canSafelyRetryChatTurn({
    error: 'network error',
    messages: [userMessage],
    toolCalls: [],
  }), true);
});
