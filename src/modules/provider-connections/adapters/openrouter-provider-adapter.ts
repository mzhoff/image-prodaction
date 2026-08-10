import {
  EMPTY_PROVIDER_USAGE,
  type ProviderAdapter,
  type ProviderCallContext,
  type ProviderExecuteRequest,
} from '../contracts/provider-contracts';
import {
  ProviderAdapterError,
  ProviderCanceledError,
  ProviderHttpError,
  ProviderTimeoutError,
  classifyProviderError,
} from '../core/provider-errors';
import { toOpenRouterMessagePart } from './openrouter-message-mapping';
import {
  extractOpenRouterFailureUsage,
  normalizeOpenRouterCredentialSummary,
  normalizeOpenRouterModels,
  normalizeOpenRouterOperationStatus,
  normalizeOpenRouterProviderUsage,
  normalizeOpenRouterResult,
} from './openrouter-response-normalizers';
import {
  readEmbeddedError,
  readJsonSafely,
  readRetryAfterMs,
  readString,
  removeUndefined,
  uniqueModalities,
} from './openrouter-value-readers';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 180_000;
const PROVIDER = 'openrouter';

type FetchProvider = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OpenRouterProviderAdapterOptions {
  appName?: string;
  baseUrl?: string;
  fetch?: FetchProvider;
  requestTimeoutMs?: number;
  siteUrl?: string;
}

export { normalizeOpenRouterProviderUsage } from './openrouter-response-normalizers';

export function createOpenRouterProviderAdapter(
  options: OpenRouterProviderAdapterOptions = {},
): ProviderAdapter {
  const requestJson = createRequestJson(options);
  const adapter: ProviderAdapter = {
    provider: PROVIDER,
    classifyError: (error, context) => classifyProviderError(error, context),
    async execute(request, context) {
      validateExecuteRequest(request);
      const payload = await requestJson('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(createExecutePayload(request)),
      }, context);
      return normalizeOpenRouterResult(payload, request);
    },
    async getCredentialSummary(context) {
      return normalizeOpenRouterCredentialSummary(
        await requestJson('/key', { method: 'GET' }, context),
      );
    },
    async getOperationStatus(providerOperationId, context) {
      if (!providerOperationId.trim()) throw permanentError('invalid_request', 'Provider operation id is required.');
      try {
        const payload = await requestJson(
          `/generation?id=${encodeURIComponent(providerOperationId)}`,
          { method: 'GET' },
          context,
        );
        return normalizeOpenRouterOperationStatus(payload, providerOperationId);
      } catch (error) {
        if (!(error instanceof ProviderHttpError) || error.status !== 404) throw error;
        return {
          error: null,
          modelId: null,
          providerOperationId,
          state: 'unknown',
          usage: { ...EMPTY_PROVIDER_USAGE },
        };
      }
    },
    async listModels(context) {
      return normalizeOpenRouterModels(
        await requestJson('/models?output_modalities=all', { method: 'GET' }, context),
      );
    },
    normalizeUsage: normalizeOpenRouterProviderUsage,
    async validateCredential(context) {
      return adapter.getCredentialSummary(context);
    },
  };
  return adapter;
}

function createExecutePayload(request: ProviderExecuteRequest) {
  return removeUndefined({
    model: request.modelId,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.parts.map(toOpenRouterMessagePart),
    })),
    modalities: request.expectedOutputModalities,
    image_config: request.parameters?.image
      ? removeUndefined({
        aspect_ratio: request.parameters.image.aspectRatio,
        image_size: request.parameters.image.size,
      })
      : undefined,
    max_tokens: request.parameters?.maxOutputTokens,
    reasoning: request.parameters?.reasoningEffort
      ? { effort: request.parameters.reasoningEffort }
      : undefined,
    stream: false,
    temperature: request.parameters?.temperature,
    usage: { include: true },
  });
}

function createRequestJson(options: OpenRouterProviderAdapterOptions) {
  const fetchProvider = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const requestTimeoutMs = normalizeTimeout(options.requestTimeoutMs);

  return async function requestJson(
    path: string,
    init: RequestInit,
    context: ProviderCallContext,
  ): Promise<unknown> {
    validateCredentialValue(context.credential);
    const { controller, dispose, timedOut } = createRequestAbort(context, requestTimeoutMs);
    let response: Response;
    try {
      response = await fetchProvider(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${context.credential}`,
          'Content-Type': 'application/json',
          ...(options.siteUrl ? { 'HTTP-Referer': options.siteUrl } : {}),
          ...(options.appName ? { 'X-OpenRouter-Title': options.appName } : {}),
          ...init.headers,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (context.signal?.aborted) throw new ProviderCanceledError(true);
      if (timedOut()) throw new ProviderTimeoutError({ requestDispatched: true });
      throw new ProviderAdapterError(classifyProviderError(error, { requestDispatched: true }), error);
    } finally {
      dispose();
    }
    const payload = await readJsonSafely(response);
    const embeddedError = readEmbeddedError(payload);
    if (!response.ok || embeddedError) {
      throw new ProviderHttpError({
        errorType: embeddedError?.errorType,
        providerOperationId: embeddedError?.providerOperationId ?? readString(payload, 'id'),
        retryAfterMs: readRetryAfterMs(response.headers.get('retry-after')),
        status: response.ok ? embeddedError?.status ?? 502 : response.status,
        usage: extractOpenRouterFailureUsage(payload),
      });
    }
    return payload;
  };
}

function createRequestAbort(context: ProviderCallContext, timeoutMs: number) {
  const controller = new AbortController();
  let didTimeOut = false;
  const timeoutId = setTimeout(() => {
    didTimeOut = true;
    controller.abort();
  }, timeoutMs);
  const cancelFromCaller = () => controller.abort();
  if (context.signal?.aborted) {
    clearTimeout(timeoutId);
    throw new ProviderCanceledError(false);
  }
  context.signal?.addEventListener('abort', cancelFromCaller, { once: true });
  return {
    controller,
    dispose: () => {
      clearTimeout(timeoutId);
      context.signal?.removeEventListener('abort', cancelFromCaller);
    },
    timedOut: () => didTimeOut,
  };
}

function validateExecuteRequest(request: ProviderExecuteRequest) {
  if (!request.operation.trim() || !request.modelId.trim()) {
    throw permanentError('invalid_request', 'Provider operation and model are required.');
  }
  if (request.messages.length === 0 || request.messages.some((message) => message.parts.length === 0)) {
    throw permanentError('invalid_request', 'Provider request requires at least one non-empty message.');
  }
  if (uniqueModalities(request.expectedOutputModalities).length === 0) {
    throw permanentError('invalid_request', 'Provider request requires at least one expected output modality.');
  }
}

function validateCredentialValue(credential: string) {
  if (!credential.trim()) throw permanentError('invalid_credential', 'Provider credential is required.');
}

function permanentError(code: 'invalid_request' | 'invalid_credential', message: string) {
  return new ProviderAdapterError({
    classification: 'permanent', code, httpStatus: null,
    message, providerOperationId: null, retryAfterMs: null,
  });
}

function normalizeTimeout(value: number | undefined) {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10 * 60_000) {
    throw new Error('OpenRouter request timeout must be between 1 and 600000 milliseconds.');
  }
  return value;
}
