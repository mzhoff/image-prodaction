import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProviderAdapterError,
  ProviderHttpError,
  createOpenRouterProviderAdapter,
  normalizeOpenRouterProviderUsage,
  type ProviderExecuteRequest,
} from '../index';
import {
  openRouterCredentialFixture,
  openRouterErrorFixture,
  openRouterGenerationStatusFixture,
  openRouterMissingImageFixture,
  openRouterModelsFixture,
  openRouterMultimodalResultFixture,
  openRouterPartialUsageFixture,
} from '../testing/openrouter-fixtures';

const explicitApiKey = 'sk-or-v1-explicit-test-key';
const executeRequest: ProviderExecuteRequest = {
  expectedOutputModalities: ['text', 'image', 'audio'],
  messages: [{
    role: 'user',
    parts: [
      { modality: 'text', text: 'Create a multimodal result.' },
      {
        data: 'ZmFrZS1yZWZlcmVuY2U=',
        mediaType: 'image/png',
        modality: 'image',
      },
    ],
  }],
  modelId: 'google/gemini-image',
  operation: 'generate_image',
  parameters: {
    image: { aspectRatio: '1:1', size: '1K' },
    temperature: 0.4,
  },
};

test('OpenRouter adapter uses only the explicitly supplied key and normalizes text/image/audio', async () => {
  let authorization = '';
  let requestBody: Record<string, unknown> | null = null;
  const adapter = createOpenRouterProviderAdapter({
    fetch: async (_input, init) => {
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse(openRouterMultimodalResultFixture);
    },
  });

  const result = await adapter.execute(executeRequest, { credential: explicitApiKey });

  assert.equal(authorization, `Bearer ${explicitApiKey}`);
  assert.equal(JSON.stringify(requestBody).includes(explicitApiKey), false);
  assert.deepEqual(result.outputs.map((output) => output.modality), ['text', 'image', 'audio']);
  assert.equal(result.providerOperationId, 'gen-fixture-1');
  assert.deepEqual(result.usage, {
    cacheReadTokens: 10,
    cacheWriteTokens: 4,
    complete: true,
    inputTokens: 75,
    outputTokens: 25,
    providerCostUsd: '0.0125',
    reasoningTokens: 3,
    totalTokens: 100,
  });
});

test('OpenRouter adapter normalizes credential summary, models and operation status', async () => {
  const adapter = createOpenRouterProviderAdapter({
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith('/key')) return jsonResponse(openRouterCredentialFixture);
      if (url.includes('/models?')) return jsonResponse(openRouterModelsFixture);
      if (url.includes('/generation?')) return jsonResponse(openRouterGenerationStatusFixture);
      return jsonResponse({}, 404);
    },
  });
  const context = { credential: explicitApiKey };

  const summary = await adapter.validateCredential(context);
  const models = await adapter.listModels(context);
  const status = await adapter.getOperationStatus('gen-fixture-1', context);

  assert.equal(summary.limitRemainingUsd, '18.75');
  assert.deepEqual(models[0]?.outputModalities, ['text', 'image']);
  assert.equal(status.state, 'succeeded');
  assert.equal(status.usage.totalTokens, 100);
  assert.equal(status.usage.providerCostUsd, '0.0125');
});

test('partial usage stays partial and never invents missing token counts', () => {
  assert.deepEqual(normalizeOpenRouterProviderUsage(openRouterPartialUsageFixture), {
    cacheReadTokens: null,
    cacheWriteTokens: null,
    complete: false,
    inputTokens: null,
    outputTokens: 7,
    providerCostUsd: '0.0007',
    reasoningTokens: null,
    totalTokens: null,
  });
});

test('accepted operation without expected modality is ambiguous', async () => {
  const adapter = createOpenRouterProviderAdapter({
    fetch: async () => jsonResponse(openRouterMissingImageFixture),
  });
  const request: ProviderExecuteRequest = {
    ...executeRequest,
    expectedOutputModalities: ['image'],
  };

  await assert.rejects(
    adapter.execute(request, { credential: explicitApiKey }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderAdapterError);
      assert.equal(error.descriptor.code, 'missing_modality');
      assert.equal(error.descriptor.classification, 'ambiguous');
      assert.equal(error.descriptor.providerOperationId, 'gen-missing-image');
      return true;
    },
  );
});

test('OpenRouter HTTP error fixtures preserve safe classification without upstream body leakage', async () => {
  const adapter = createOpenRouterProviderAdapter({
    fetch: async () => jsonResponse(openRouterErrorFixture(401, 'authentication'), 401),
  });

  await assert.rejects(
    adapter.validateCredential({ credential: explicitApiKey }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderHttpError);
      const descriptor = adapter.classifyError(error);
      assert.equal(descriptor.code, 'invalid_credential');
      assert.equal(descriptor.classification, 'permanent');
      assert.equal(descriptor.message.includes('Fixture provider error'), false);
      assert.equal(descriptor.message.includes(explicitApiKey), false);
      return true;
    },
  );
});

test('OpenRouter HTTP errors preserve returned operation usage for the billing ledger', async () => {
  const adapter = createOpenRouterProviderAdapter({
    fetch: async () => jsonResponse({
      id: 'accepted-operation-1',
      usage: {
        prompt_tokens: 12,
        completion_tokens: 3,
        total_tokens: 15,
        cost: 0.0042,
      },
      error: {
        code: 503,
        message: 'Fixture provider error',
        metadata: { error_type: 'provider_unavailable' },
      },
    }, 503),
  });

  await assert.rejects(
    adapter.execute(executeRequest, { credential: explicitApiKey }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderHttpError);
      assert.equal(error.providerOperationId, 'accepted-operation-1');
      assert.deepEqual(error.usage, {
        cacheReadTokens: null,
        cacheWriteTokens: null,
        complete: true,
        inputTokens: 12,
        outputTokens: 3,
        providerCostUsd: '0.0042',
        reasoningTokens: null,
        totalTokens: 15,
      });
      assert.equal(adapter.classifyError(error).classification, 'ambiguous');
      return true;
    },
  );
});

const openRouterErrorCases = [
  [401, 'authentication', 'invalid_credential', 'permanent'],
  [402, 'payment_required', 'payment_required', 'permanent'],
  [403, 'permission_denied', 'forbidden', 'permanent'],
  [408, 'timeout', 'timeout', 'ambiguous'],
  [429, 'rate_limit_exceeded', 'rate_limited', 'retryable'],
  [500, 'server', 'upstream_unavailable', 'retryable'],
  [502, 'provider_unavailable', 'upstream_unavailable', 'retryable'],
  [503, 'provider_overloaded', 'upstream_unavailable', 'retryable'],
] as const;

for (const [status, errorType, code, classification] of openRouterErrorCases) {
  test(`OpenRouter ${status} fixture maps to ${classification}`, async () => {
    const adapter = createOpenRouterProviderAdapter({
      fetch: async () => jsonResponse(openRouterErrorFixture(status, errorType), status),
    });
    await assert.rejects(
      adapter.validateCredential({ credential: explicitApiKey }),
      (error: unknown) => {
        const descriptor = adapter.classifyError(error);
        assert.equal(descriptor.code, code);
        assert.equal(descriptor.classification, classification);
        return true;
      },
    );
  });
}

test('adapter timeout after fetch dispatch is classified as ambiguous', async () => {
  const adapter = createOpenRouterProviderAdapter({
    requestTimeoutMs: 5,
    fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    }),
  });

  await assert.rejects(
    adapter.execute(executeRequest, { credential: explicitApiKey }),
    (error: unknown) => {
      const descriptor = adapter.classifyError(error);
      assert.equal(descriptor.code, 'timeout');
      assert.equal(descriptor.classification, 'ambiguous');
      return true;
    },
  );
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
