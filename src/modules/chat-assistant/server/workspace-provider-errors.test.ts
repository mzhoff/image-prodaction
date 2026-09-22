import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenRouterRequestError } from '@prodactionpro/chat-connectors';
import { ChatClientError } from '@prodactionpro/chat-sdk';
import { createNextChatStreamRoute } from '@prodactionpro/chat-runtime-next/server';
import { createImageProductionChatClient } from '../adapters/client/chat-client';
import { ProviderConnectionNotConfiguredError } from '@/modules/provider-connections/core/provider-connection-errors';
import { MemberBudgetError } from '@/modules/workspace-budgets/core/member-budget-policy';
import { toWorkspaceChatError } from './workspace-provider-errors';

const cases = [
  [new ProviderConnectionNotConfiguredError(), 'CHAT_WORKSPACE_PROVIDER_REQUIRED', /ещё не активирован/, 409],
  [new ProviderConnectionNotConfiguredError(true), 'CHAT_WORKSPACE_PROVIDER_UNAVAILABLE', /не означает.*нулю/, 409],
  [new MemberBudgetError('member_budget_exhausted', 'internal', 402), 'CHAT_MEMBER_BUDGET_EXHAUSTED', /личный лимит/, 402],
  [new MemberBudgetError('member_ai_disabled', 'internal'), 'CHAT_MEMBER_AI_DISABLED', /отключил для вас/, 403],
  [new MemberBudgetError('member_usage_pending', 'Стоимость предыдущего запроса ещё уточняется.', 409), 'CHAT_MEMBER_USAGE_PENDING', /ещё уточняется/, 409],
  [new OpenRouterRequestError('secret provider response', 'PAYMENT_REQUIRED', false, 402), 'CHAT_WORKSPACE_BUDGET_REQUIRED', /общий резерв/, 402],
] as const;

for (const [sourceError, expectedCode, expectedCopy, status] of cases) {
  test(`real ChatModule SSE route and SDK preserve ${expectedCode}`, async () => {
    const originalFetch = globalThis.fetch;
    let requests = 0;
    const route = createNextChatStreamRoute({
      backend: {
        createTurn: async () => { throw toWorkspaceChatError(sourceError); },
        streamTurn: async function* () {
          yield* [];
          throw toWorkspaceChatError(sourceError);
        },
      },
      resolvePrincipal: () => ({ userId: 'user-1', tenantId: 'workspace-1', productId: 'image-production' }),
    });
    globalThis.fetch = (async (url, init) => {
      requests++;
      return route(new Request(`http://localhost${String(url)}`, init));
    }) as typeof fetch;
    try {
      await assert.rejects(createImageProductionChatClient('workspace-1').streamTurn({
        message: 'Проверка', mode: 'product-copilot', model: 'openai/gpt-5.4-nano',
      }), (error: unknown) => {
        assert.ok(error instanceof ChatClientError);
        assert.equal(error.code, expectedCode);
        assert.equal(error.statusCode, status);
        assert.equal(error.retryable, false);
        assert.match(error.message, expectedCopy);
        assert.doesNotMatch(error.message, /Unknown chat stream|secret provider response/);
        return true;
      });
      assert.equal(requests, 1, 'blocked budget must not trigger stream retries');
    } finally { globalThis.fetch = originalFetch; }
  });
}

test('unknown provider failures are left to the shared safe error policy', () => {
  const unknown = new Error('private diagnostics');
  assert.equal(toWorkspaceChatError(unknown), unknown);
});
