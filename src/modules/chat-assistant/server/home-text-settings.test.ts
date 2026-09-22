import assert from 'node:assert/strict';
import test from 'node:test';
import { createSensitiveAttachmentBinarySource, SensitiveAttachmentString } from '@prodactionpro/chat-connectors';
import { EMPTY_PROVIDER_USAGE } from '@/modules/provider-connections/contracts/provider-contracts';
import { homeTextSettingsSchema, homeTextSettingsSelector } from '../contracts/home-text-settings';
import { readHomeTextSettings } from './home-text-settings-service';
import { createHomeTextGateway } from './home-text-gateway';
import { readChatAssistantConfig } from './config';

const settings = { model: 'google/gemini-2.5-flash', temperature: 0.7, reasoning: 'high' as const, outputStyle: 'numbered-list' as const };
const principal = { productId: 'image-production', tenantId: 'workspace', userId: 'user' };
const id = '01900000-0000-7000-8000-000000000013';
test('Text settings are bounded and do not accept credentials or tenant authority', () => {
  assert.equal(homeTextSettingsSchema.parse(settings).temperature, 0.7);
  for (const extra of [{ temperature: -1 }, { temperature: 2.1 }, { reasoning: 'unlimited' }, { apiKey: 'secret' }, { workspaceId: 'foreign' }]) {
    assert.equal(homeTextSettingsSchema.safeParse({ ...settings, ...extra }).success, false);
  }
});
test('Text selector is pinned to the same user, Workspace and conversation', async () => {
  const row = { id, settings, conversationId: 'home:test', userId: 'user', workspaceId: 'workspace', createdAt: new Date() };
  const selector = homeTextSettingsSelector(id);
  assert.deepEqual(await readHomeTextSettings(principal, 'home:test', selector, async () => row), settings);
  for (const extra of [{ userId: 'other' }, { workspaceId: 'other' }, { conversationId: 'other' }]) {
    await assert.rejects(readHomeTextSettings(principal, 'home:test', selector, async () => ({ ...row, ...extra })), /недоступны/);
  }
  assert.equal(await readHomeTextSettings(principal, 'home:test', { route: '/' }), undefined);
});
test('Home gateway carries selected model, creativity, reasoning, output style, image bytes and usage without paid retries', async () => {
  let calls = 0;
  const config = readChatAssistantConfig();
  const gateway = createHomeTextGateway('test-key', settings, config, { async execute(request, context) {
    calls++; assert.equal(context.credential, 'test-key'); assert.equal(request.modelId, settings.model);
    assert.equal(request.parameters?.temperature, .7); assert.equal(request.parameters?.reasoningEffort, 'high');
    assert.equal(request.parameters?.maxOutputTokens, config.maxOutputTokens);
    assert.match(JSON.stringify(request.messages), /нумерованным/);
    assert.ok(request.messages.some((message) => message.parts.some((part) => part.modality === 'image' && part.data === 'AQID')));
    assert.ok(request.messages.some((message) => message.parts.some((part) => part.modality === 'image' && part.url === 'https://example.test/signed')));
    return { modelId: request.modelId, provider: 'openrouter', metadata: {}, providerOperationId: 'test-operation',
      outputs: [{ modality: 'text', text: '1. Ответ' }], usage: { ...EMPTY_PROVIDER_USAGE, inputTokens: 8, outputTokens: 5, totalTokens: 13, providerCostUsd: '0.004' } };
  } });
  const result = await gateway.completeWithTools({ model: settings.model, tools: [], maxTokens: config.maxOutputTokens + 1000,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Проанализируй' },
      { type: 'image', attachmentId: 'one', mimeType: 'image/png', delivery: { kind: 'inline-bytes', sizeBytes: 3, source: createSensitiveAttachmentBinarySource(async () => new Uint8Array([1, 2, 3])) } },
      { type: 'image', attachmentId: 'two', mimeType: 'image/png', delivery: { kind: 'remote-url', url: new SensitiveAttachmentString('https://example.test/signed'), expiresAt: new Date(Date.now() + 60_000).toISOString() } }] }] });
  assert.equal(calls, 1); assert.equal(result.content, '1. Ответ'); assert.deepEqual(result.toolCalls, []);
  assert.deepEqual(result.usage, { promptTokens: 8, completionTokens: 5, totalTokens: 13, costUsd: .004 });
});
test('An ambiguous text-provider failure is never automatically retried', async () => {
  let calls = 0;
  const gateway = createHomeTextGateway('test-key', settings, readChatAssistantConfig(), { async execute() { calls++; throw new Error('timeout'); } });
  await assert.rejects(gateway.completeWithTools({ model: settings.model, messages: [], tools: [] }), /мог продолжиться/);
  assert.equal(calls, 1);
});
