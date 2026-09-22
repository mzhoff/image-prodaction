import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceProviderResolver } from './workspace-provider';
import { readChatAssistantConfig } from './config';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import { ProviderConnectionNotConfiguredError } from '@/modules/provider-connections/core/provider-connection-errors';
test('Ask AI resolves user/workspace separately each turn, observes key rotation, and never falls back', async () => {
  const observed: string[] = []; const keys: string[] = []; let version = 1;
  const resolve = createWorkspaceProviderResolver(readChatAssistantConfig(), {
    resolve: async (user, workspace) => {
      observed.push(`${user}:${workspace}`);
      if (user === 'other') throw new Error('membership denied');
      if (workspace === 'empty') throw new ProviderConnectionNotConfiguredError();
      return { apiKey: `${workspace}-${version}`, connection: { id: workspace } };
    },
    markUsed: async () => {}, gateway: (key) => { keys.push(key); return { completeWithTools: async () => { throw new Error('no paid call in test'); } }; },
  });
  type Input = Parameters<typeof resolve>[0];
  const input = (userId: string, tenantId: string) => ({ principal: { userId, tenantId, productId: CHAT_ASSISTANT_PRODUCT_ID } }) as Input;
  const first = await resolve(input('one', 'ws1')); version++;
  const second = await resolve(input('two', 'ws2'));
  assert.equal(first.connectionId, 'ws1'); assert.equal(second.connectionId, 'ws2');
  await resolve(input('one', 'ws1'));
  assert.deepEqual(observed, ['one:ws1', 'two:ws2', 'one:ws1']);
  assert.deepEqual(keys, ['ws1-1', 'ws2-2', 'ws1-2']);
  await assert.rejects(async () => resolve(input('other', 'ws1')), /membership denied/);
  await assert.rejects(async () => resolve(input('one', 'empty')), /AI-бюджет/);
  await assert.rejects(async () => resolve(input('one', '')), /пространство недоступно/);
});


test('Flow accepts supported composer models and rejects an arbitrary model without a paid call', async () => {
  const config = readChatAssistantConfig();
  const resolve = createWorkspaceProviderResolver(config, {
    resolve: async () => ({ apiKey: 'test-only', connection: { id: 'workspace' } }),
    markUsed: async () => {},
    gateway: () => ({ completeWithTools: async () => { throw new Error('no paid call in test'); } }),
  });
  type Input = Parameters<typeof resolve>[0];
  const input = (mode: string, model: string) => ({
    principal: { userId: 'member', tenantId: 'workspace', productId: CHAT_ASSISTANT_PRODUCT_ID },
    request: { mode, model },
  }) as Input;
  assert.equal((await resolve(input('product-copilot', 'google/gemini-2.5-flash'))).providerId, 'openrouter');
  assert.equal((await resolve(input('product-copilot', config.model))).providerId, 'openrouter');
  await assert.rejects(async () => resolve(input('product-copilot', 'unapproved/model')), /Выберите модель/);
  // Home text still requires its persisted settings, knowledge mode keeps its fixed model.
  await assert.rejects(async () => resolve(input('general-chat', 'google/gemini-2.5-flash')), /Выберите модель/);
  await assert.rejects(async () => resolve(input('knowledge-base', 'google/gemini-2.5-flash')), /Выберите модель/);
});
