import assert from 'node:assert/strict';
import test from 'node:test';
import { readChatAssistantConfig } from './config.ts';

test('tool-heavy assistant turns receive a larger bounded output budget', () => {
  const previous = process.env.CHAT_ASSISTANT_MAX_OUTPUT_TOKENS;
  try {
    delete process.env.CHAT_ASSISTANT_MAX_OUTPUT_TOKENS;
    assert.equal(readChatAssistantConfig().maxOutputTokens, 3_600);

    process.env.CHAT_ASSISTANT_MAX_OUTPUT_TOKENS = '999999';
    assert.equal(readChatAssistantConfig().maxOutputTokens, 4_000);
  } finally {
    if (previous === undefined) delete process.env.CHAT_ASSISTANT_MAX_OUTPUT_TOKENS;
    else process.env.CHAT_ASSISTANT_MAX_OUTPUT_TOKENS = previous;
  }
});
