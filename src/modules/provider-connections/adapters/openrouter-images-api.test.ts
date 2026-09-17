import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenRouterProviderAdapter } from './openrouter-provider-adapter';
import { createOpenRouterImageCatalog } from './openrouter-image-catalog';
import { normalizeImagesApiResult } from './openrouter-images-api';
import { ProviderAdapterError, ProviderHttpError } from '../core/provider-errors';
import type { ProviderExecuteRequest } from '../contracts/provider-contracts';

const modelId = 'openai/gpt-image-2.5-flare';
const parameters = {
  aspect_ratio: { type: 'enum', values: ['1:1', '16:9', 'auto'] },
  quality: { type: 'enum', values: ['auto', 'low', 'high', 'xhigh', 'max'] },
  background: { type: 'enum', values: ['auto', 'transparent', 'opaque'] },
  input_references: { type: 'range', min: 0, max: 16 },
};
const catalogResponse = { data: [{ id: modelId, name: 'OpenAI: GPT Image 2.5 Flare',
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] }, supported_parameters: parameters }] };
const endpointResponse = { endpoints: [{ provider_tag: 'openai', supported_parameters: parameters }] };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const usage = { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110, cost: 0.042 };
const request: ProviderExecuteRequest = {
  modelId, operation: 'generate_image', expectedOutputModalities: ['image'],
  messages: [{ role: 'user', parts: [{ modality: 'text', text: 'Keep this subject.' }, { modality: 'image', data: png, mediaType: 'image/png' }] }],
  parameters: { image: { api: 'images', aspectRatio: '16:9', size: 'auto', imageQuality: 'xhigh', imageBackground: 'transparent' } },
};

function fakeFetch(post: (init?: RequestInit) => Response | Promise<Response>, endpoints = endpointResponse) {
  return async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.ok(String(url).startsWith('https://openrouter.ai/api/v1/'));
    if (String(url).endsWith('/images/models')) {
      assert.equal(init?.headers, undefined, 'public catalog never receives the credential');
      return Response.json(catalogResponse);
    }
    if (String(url).endsWith('/endpoints')) return Response.json(endpoints);
    assert.ok(String(url).endsWith('/images'), 'new model must use Images API, not Chat Completions');
    return post(init);
  };
}

test('Images API uses the existing OpenRouter key, exact supported options, references and normalized cost', async () => {
  let posts = 0;
  const adapter = createOpenRouterProviderAdapter({ fetch: fakeFetch((init) => {
    posts++;
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-workspace-key');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: modelId, prompt: 'Keep this subject.', n: 1, stream: false,
      input_references: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } }],
      aspect_ratio: '16:9', quality: 'xhigh', background: 'transparent',
      provider: { only: ['openai'], allow_fallbacks: false },
    });
    return Response.json({ created: 123, data: [{ b64_json: png }], usage });
  }) });
  const result = await adapter.execute(request, { credential: 'test-workspace-key' });
  assert.equal(posts, 1);
  assert.equal(result.providerOperationId, null, 'an Images response without an id must not fabricate a recovery id');
  assert.equal(result.usage.providerCostUsd, '0.042');
  assert.equal(result.usage.totalTokens, 110);
  assert.deepEqual(result.outputs, [{ modality: 'image', data: png, mediaType: 'image/png' }]);
});

test('unsupported resolution, model, reference count and endpoint combination fail before payment', async () => {
  let posts = 0;
  const fetcher = fakeFetch(() => { posts++; return Response.json({}); });
  const adapter = createOpenRouterProviderAdapter({ fetch: fetcher });
  await assert.rejects(adapter.execute({ ...request, parameters: { image: { ...request.parameters!.image, size: '1K' } } }, { credential: 'key' }), /resolution/);
  await assert.rejects(adapter.execute({ ...request, modelId: 'openai/imaginary-model' }, { credential: 'key' }), /каталоге/);
  const incompatible = createOpenRouterProviderAdapter({ fetch: fakeFetch(() => { posts++; return Response.json({}); }, {
    endpoints: [{ provider_tag: 'other', supported_parameters: { ...parameters, quality: { type: 'enum', values: ['low'] } } }],
  }) });
  await assert.rejects(incompatible.execute(request, { credential: 'key' }), /сочетание/);
  const tooMany = { ...request, messages: [{ role: 'user' as const, parts: Array.from({ length: 5 }, () => request.messages[0].parts[1]) }] };
  await assert.rejects(adapter.execute(tooMany, { credential: 'key' }), /до 4/);
  assert.equal(posts, 0);
});

test('catalog outages fail before paid dispatch and concurrent public catalog reads are deduplicated', async () => {
  let reads = 0;
  const catalog = createOpenRouterImageCatalog(async () => { reads++; return Response.json(catalogResponse); });
  await Promise.all([catalog.listModels(), catalog.listModels(), catalog.listModels()]);
  await catalog.listModels();
  assert.equal(reads, 1);
  const adapter = createOpenRouterProviderAdapter({ fetch: async () => Response.json({}, { status: 503 }) });
  await assert.rejects(adapter.execute(request, { credential: 'key' }), (error) => {
    assert.ok(error instanceof ProviderAdapterError);
    assert.equal(error.descriptor.classification, 'retryable');
    assert.match(error.message, /не отправлен/);
    return true;
  });
});

test('invalid paid responses preserve usage and remain ambiguous without an operation id', async () => {
  assert.throws(() => normalizeImagesApiResult({ data: [{ b64_json: Buffer.from('<svg/>').toString('base64') }], usage }, request), (error) => {
    assert.ok(error instanceof ProviderAdapterError);
    assert.equal(error.descriptor.classification, 'ambiguous');
    assert.ok(error.cause instanceof ProviderHttpError);
    assert.equal(error.cause.usage?.providerCostUsd, '0.042');
    return true;
  });
  const adapter = createOpenRouterProviderAdapter({ fetch: fakeFetch(() => new Response('invalid json')) });
  await assert.rejects(adapter.execute(request, { credential: 'key' }), (error) => {
    assert.ok(error instanceof ProviderAdapterError);
    assert.equal(error.descriptor.classification, 'ambiguous');
    return true;
  });
});

test('response body timeout after dispatch blocks an automatic paid retry', async () => {
  const adapter = createOpenRouterProviderAdapter({ requestTimeoutMs: 5, fetch: fakeFetch((init) => new Response(new ReadableStream({
    start(controller) { init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError'))); },
  }))) });
  await assert.rejects(adapter.execute(request, { credential: 'key' }), (error) => {
    assert.equal(adapter.classifyError(error, { requestDispatched: true }).classification, 'ambiguous');
    return true;
  });
});
