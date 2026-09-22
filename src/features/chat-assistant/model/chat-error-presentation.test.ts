import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatErrorPayload } from '@prodactionpro/chat-sdk';
import { presentChatError } from './chat-error-presentation';

test('unknown outcome copy never changes retry or execution safety metadata', () => {
  const error: ChatErrorPayload = {
    code: 'CHAT_STREAM_FAILED', message: 'Unknown chat stream error',
    executionState: 'ambiguous', retryable: false, turnId: 'turn-1', requestId: 'request-1',
  };
  const result = presentChatError(error);
  assert.match(result.message, /могла выполниться/);
  assert.match(result.message, /не означает, что баланс исчерпан/);
  assert.deepEqual({ ...result, message: error.message }, error);
});

test('non-budget server failures are not presented as missing budget', () => {
  const result = presentChatError({ code: 'CHAT_REQUEST_FAILED', message: 'Chat request failed', statusCode: 503, executionState: 'not-started', retryable: true });
  assert.match(result.message, /Ассистент сейчас недоступен/);
  assert.equal(result.retryable, true);
  assert.equal(result.executionState, 'not-started');
  assert.doesNotMatch(result.message, /не активирован/);
});
