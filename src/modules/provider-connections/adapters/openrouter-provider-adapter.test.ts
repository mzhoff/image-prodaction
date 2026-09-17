import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
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

test('Gemini generation optimises reference copies before validating final request size', async () => {
  const source = await sharp({ create: { width: 2400, height: 1800, channels: 4, background: 'blue' } })
    .png({ compressionLevel: 0 }).toBuffer();
  const request: ProviderExecuteRequest = {
    expectedOutputModalities: ['image'], modelId: 'google/gemini-3.1-flash-image-preview', operation: 'generate_image',
    messages: [{ role: 'user', parts: [{ modality: 'text', text: 'Keep the reference.' }, { modality: 'image', mediaType: 'image/png', data: source.toString('base64') }] }],
  };
  assert.ok(JSON.stringify(request).length > 20_000_000);
  const original = JSON.stringify(request);
  let calls = 0;
  const adapter = createOpenRouterProviderAdapter({ fetch: async (_url, init) => {
    calls++;
    const body = String(init?.body);
    assert.ok(Buffer.byteLength(body) < 20_000_000);
    const payload = JSON.parse(body);
    assert.equal(payload.messages[0].content[0].text, 'Keep the reference.');
    const url = payload.messages[0].content[1].image_url.url as string;
    assert.match(url, /^data:image\/webp;base64,/);
    const received = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    assert.equal((await sharp(received).ensureAlpha().raw().toBuffer()).equals(await sharp(source).ensureAlpha().raw().toBuffer()), true);
    return jsonResponse(openRouterMultimodalResultFixture);
  } });
  await adapter.execute(request, { credential: explicitApiKey });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(request), original);
});

test('oversized inline Gemini request fails permanently before network dispatch', async () => {
  let calls = 0;
  const adapter = createOpenRouterProviderAdapter({ fetch: async () => { calls++; return jsonResponse(openRouterMultimodalResultFixture); } });
  const request: ProviderExecuteRequest = {
    expectedOutputModalities: ['image'], modelId: 'google/gemini-3.1-flash-image-preview', operation: 'generate_image',
    messages: [{ role: 'user', parts: [{ modality: 'image', mediaType: 'image/webp', data: 'A'.repeat(20_000_000) }] }],
  };
  await assert.rejects(adapter.execute(request, { credential: explicitApiKey }), error => {
    assert.ok(error instanceof ProviderAdapterError);
    assert.equal(error.descriptor.classification, 'permanent');
    assert.equal(error.descriptor.code, 'invalid_request');
    assert.match(error.message, /20 МБ/);
    assert.equal(error.message.includes(explicitApiKey), false);
    return true;
  });
  assert.equal(calls, 0);
});
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

test('OpenRouter adapter sends strict structured output schema and requires provider support', async () => {
  let requestBody: Record<string, unknown> | null = null;
  const adapter = createOpenRouterProviderAdapter({
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        id: 'structured-1',
        model: 'google/gemini-2.5-flash',
        choices: [{ message: { content: '{"idea":"Ready"}' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    },
  });

  await adapter.execute({
    expectedOutputModalities: ['text'],
    messages: [{ role: 'user', parts: [{ modality: 'text', text: 'Extract.' }] }],
    modelId: 'google/gemini-2.5-flash',
    operation: 'generate_structured_data',
    parameters: {
      structuredOutput: {
        name: 'content_idea',
        schema: {
          type: 'object', additionalProperties: false,
          properties: { idea: { type: 'string' } }, required: ['idea'],
        },
      },
    },
  }, { credential: explicitApiKey });

  const body = requestBody as Record<string, unknown> | null;
  assert.ok(body);
  assert.deepEqual(body.provider, { require_parameters: true });
  assert.deepEqual(body.response_format, {
    type: 'json_schema',
    json_schema: {
      name: 'content_idea',
      strict: true,
      schema: {
        type: 'object', additionalProperties: false,
        properties: { idea: { type: 'string' } }, required: ['idea'],
      },
    },
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
