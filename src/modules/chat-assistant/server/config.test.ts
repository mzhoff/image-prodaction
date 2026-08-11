import assert from 'node:assert/strict';
import test from 'node:test';
import { readChatAssistantConfig, toPublicChatAssistantConfig } from './config.ts';

test('assistant config fails closed and public projection never contains secrets', () => {
  const previous = {
    enabled: process.env.CHAT_ASSISTANT_ENABLED,
    key: process.env.CHAT_OPENROUTER_API_KEY,
    maxToolCalls: process.env.CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN,
    secret: process.env.CHAT_TOOL_APPROVAL_SECRET,
  };
  try {
    process.env.CHAT_ASSISTANT_ENABLED = 'true';
    process.env.CHAT_OPENROUTER_API_KEY = 'server-secret-key';
    process.env.CHAT_TOOL_APPROVAL_SECRET = 'short';
    const incomplete = readChatAssistantConfig();
    assert.equal(incomplete.enabled, false);
    assert.deepEqual(incomplete.missingSettings, ['CHAT_TOOL_APPROVAL_SECRET']);

    process.env.CHAT_TOOL_APPROVAL_SECRET = 'x'.repeat(32);
    process.env.CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN = '99';
    const completeConfig = readChatAssistantConfig();
    assert.equal(completeConfig.maxToolCallsPerTurn, 5);
    const publicConfig = toPublicChatAssistantConfig(completeConfig);
    assert.equal(publicConfig.enabled, true);
    assert.equal('apiKey' in publicConfig, false);
    assert.equal('approvalSecret' in publicConfig, false);
    assert.doesNotMatch(JSON.stringify(publicConfig), /server-secret-key/);
  } finally {
    restoreEnv('CHAT_ASSISTANT_ENABLED', previous.enabled);
    restoreEnv('CHAT_OPENROUTER_API_KEY', previous.key);
    restoreEnv('CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN', previous.maxToolCalls);
    restoreEnv('CHAT_TOOL_APPROVAL_SECRET', previous.secret);
  }
});

function restoreEnv(name: string, value?: string) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
