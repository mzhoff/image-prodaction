import assert from 'node:assert/strict';
import test from 'node:test';
import { readChatAssistantConfig, toPublicChatAssistantConfig } from './config.ts';

test('assistant config fails closed and public projection never contains secrets', () => {
  const previous = {
    enabled: process.env.CHAT_ASSISTANT_ENABLED,
    modelDelivery: process.env.CHAT_ATTACHMENT_MODEL_DELIVERY,
    bucket: process.env.S3_BUCKET,
    key: process.env.CHAT_OPENROUTER_API_KEY,
    maxToolCalls: process.env.CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN,
    providerTimeout: process.env.CHAT_ASSISTANT_PROVIDER_TIMEOUT_MS,
    providerMaxAttempts: process.env.CHAT_ASSISTANT_PROVIDER_MAX_ATTEMPTS,
    providerRetryBaseDelay: process.env.CHAT_ASSISTANT_PROVIDER_RETRY_BASE_MS,
    providerRetryDeadline: process.env.CHAT_ASSISTANT_PROVIDER_RETRY_DEADLINE_MS,
    serverTurnDeadline: process.env.CHAT_ASSISTANT_SERVER_TURN_DEADLINE_MS,
    secret: process.env.CHAT_TOOL_APPROVAL_SECRET,
  };
  try {
    process.env.CHAT_ASSISTANT_ENABLED = 'true';
    process.env.CHAT_ATTACHMENT_MODEL_DELIVERY = 'inline-bytes';
    process.env.S3_BUCKET = 'private-assets';
    process.env.CHAT_OPENROUTER_API_KEY = 'server-secret-key';
    process.env.CHAT_TOOL_APPROVAL_SECRET = 'short';
    const incomplete = readChatAssistantConfig();
    assert.equal(incomplete.enabled, false);
    assert.deepEqual(incomplete.missingSettings, ['CHAT_TOOL_APPROVAL_SECRET']);

    process.env.CHAT_TOOL_APPROVAL_SECRET = 'x'.repeat(32);
    process.env.CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN = '99';
    process.env.CHAT_ASSISTANT_PROVIDER_MAX_ATTEMPTS = '99';
    process.env.CHAT_ASSISTANT_PROVIDER_RETRY_BASE_MS = '999999';
    process.env.CHAT_ASSISTANT_PROVIDER_RETRY_DEADLINE_MS = '999999';
    process.env.CHAT_ASSISTANT_PROVIDER_TIMEOUT_MS = '999999';
    process.env.CHAT_ASSISTANT_SERVER_TURN_DEADLINE_MS = '999999';
    const completeConfig = readChatAssistantConfig();
    assert.equal(completeConfig.maxToolCallsPerTurn, 8);
    assert.equal(completeConfig.providerMaxAttempts, 4);
    assert.equal(completeConfig.providerRetryBaseDelayMs, 5_000);
    assert.equal(completeConfig.providerRetryDeadlineMs, 70_000);
    assert.equal(completeConfig.providerRequestTimeoutMs, 60_000);
    assert.equal(completeConfig.serverTurnDeadlineMs, 75_000);
    assert.equal(completeConfig.attachmentModelDelivery, 'inline-bytes');
    const publicConfig = toPublicChatAssistantConfig(completeConfig);
    assert.equal(publicConfig.enabled, true);
    assert.equal('apiKey' in publicConfig, false);
    assert.equal('approvalSecret' in publicConfig, false);
    assert.doesNotMatch(JSON.stringify(publicConfig), /server-secret-key/);
  } finally {
    restoreEnv('CHAT_ASSISTANT_ENABLED', previous.enabled);
    restoreEnv('CHAT_ATTACHMENT_MODEL_DELIVERY', previous.modelDelivery);
    restoreEnv('S3_BUCKET', previous.bucket);
    restoreEnv('CHAT_OPENROUTER_API_KEY', previous.key);
    restoreEnv('CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN', previous.maxToolCalls);
    restoreEnv('CHAT_ASSISTANT_PROVIDER_TIMEOUT_MS', previous.providerTimeout);
    restoreEnv('CHAT_ASSISTANT_PROVIDER_MAX_ATTEMPTS', previous.providerMaxAttempts);
    restoreEnv('CHAT_ASSISTANT_PROVIDER_RETRY_BASE_MS', previous.providerRetryBaseDelay);
    restoreEnv('CHAT_ASSISTANT_PROVIDER_RETRY_DEADLINE_MS', previous.providerRetryDeadline);
    restoreEnv('CHAT_ASSISTANT_SERVER_TURN_DEADLINE_MS', previous.serverTurnDeadline);
    restoreEnv('CHAT_TOOL_APPROVAL_SECRET', previous.secret);
  }
});

function restoreEnv(name: string, value?: string) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
