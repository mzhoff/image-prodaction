import {
  EMPTY_PROVIDER_USAGE,
  PROVIDER_MODALITIES,
  type ProviderAdapter,
  type ProviderAudioOutput,
  type ProviderCallContext,
  type ProviderCredentialSummary,
  type ProviderExecuteRequest,
  type ProviderImageOutput,
  type ProviderMessagePart,
  type ProviderModel,
  type ProviderModality,
  type ProviderOperationStatus,
  type ProviderOutput,
  type ProviderResult,
  type ProviderSafeMetadata,
  type ProviderUsage,
} from '../contracts/provider-contracts';
import type {
  ProviderErrorClassificationContext,
  ProviderErrorDescriptor,
} from '../contracts/provider-error-contracts';
import {
  ProviderAdapterError,
  ProviderCanceledError,
  ProviderHttpError,
  ProviderTimeoutError,
  classifyProviderError,
  createInvalidProviderResponseError,
  createMissingModalityError,
} from '../core/provider-errors';

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

export function createOpenRouterProviderAdapter(
  options: OpenRouterProviderAdapterOptions = {},
): ProviderAdapter {
  const fetchProvider = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const requestTimeoutMs = normalizeTimeout(options.requestTimeoutMs);

  const adapter: ProviderAdapter = {
    provider: PROVIDER,

    classifyError(error, context) {
      return classifyProviderError(error, context);
    },

    async execute(request, context) {
      validateExecuteRequest(request);
      const payload = await requestJson(
        '/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify(removeUndefined({
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
          })),
        },
        context,
      );
      return normalizeOpenRouterResult(payload, request);
    },

    async getCredentialSummary(context) {
      const payload = await requestJson('/key', { method: 'GET' }, context);
      return normalizeOpenRouterCredentialSummary(payload);
    },

    async getOperationStatus(providerOperationId, context) {
      if (!providerOperationId.trim()) {
        throw createPermanentAdapterError('invalid_request', 'Provider operation id is required.');
      }
      try {
        const payload = await requestJson(
          `/generation?id=${encodeURIComponent(providerOperationId)}`,
          { method: 'GET' },
          context,
        );
        return normalizeOpenRouterOperationStatus(payload, providerOperationId);
      } catch (error) {
        if (error instanceof ProviderHttpError && error.status === 404) {
          return {
            error: null,
            modelId: null,
            providerOperationId,
            state: 'unknown',
            usage: { ...EMPTY_PROVIDER_USAGE },
          };
        }
        throw error;
      }
    },

    async listModels(context) {
      const payload = await requestJson('/models?output_modalities=all', { method: 'GET' }, context);
      return normalizeOpenRouterModels(payload);
    },

    normalizeUsage(rawUsage) {
      return normalizeOpenRouterProviderUsage(rawUsage);
    },

    async validateCredential(context) {
      return adapter.getCredentialSummary(context);
    },
  };

  return adapter;

  async function requestJson(
    path: string,
    init: RequestInit,
    context: ProviderCallContext,
  ): Promise<unknown> {
    validateCredentialValue(context.credential);
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);
    const cancelFromCaller = () => controller.abort();
    if (context.signal) {
      if (context.signal.aborted) {
        clearTimeout(timeoutId);
        throw new ProviderCanceledError(false);
      }
      context.signal.addEventListener('abort', cancelFromCaller, { once: true });
    }

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
      if (timedOut) {
        throw new ProviderTimeoutError({ requestDispatched: true });
      }
      throw new ProviderAdapterError(
        classifyProviderError(error, { requestDispatched: true }),
        error,
      );
    } finally {
      clearTimeout(timeoutId);
      context.signal?.removeEventListener('abort', cancelFromCaller);
    }

    const payload = await readJsonSafely(response);
    const embeddedError = readEmbeddedError(payload);
    if (!response.ok || embeddedError) {
      throw new ProviderHttpError({
        errorType: embeddedError?.errorType,
        providerOperationId: embeddedError?.providerOperationId ?? readString(payload, 'id'),
        retryAfterMs: readRetryAfterMs(response.headers.get('retry-after')),
        status: response.ok
          ? embeddedError?.status ?? 502
          : response.status,
        usage: extractOpenRouterFailureUsage(payload),
      });
    }
    return payload;
  }
}

function extractOpenRouterFailureUsage(raw: unknown) {
  const payload = asRecord(raw);
  const error = asRecord(payload?.error);
  const metadata = asRecord(error?.metadata);
  const candidates = [
    payload?.usage,
    asRecord(payload?.data)?.usage,
    error?.usage,
    metadata?.usage,
  ];
  for (const candidate of candidates) {
    const usage = normalizeOpenRouterProviderUsage(candidate);
    if (
      usage.inputTokens !== null
      || usage.outputTokens !== null
      || usage.totalTokens !== null
      || usage.providerCostUsd !== null
    ) {
      return usage;
    }
  }
  return null;
}

export function normalizeOpenRouterProviderUsage(rawUsage: unknown): ProviderUsage {
  const usage = asRecord(rawUsage);
  const promptDetails = asRecord(usage?.prompt_tokens_details);
  const completionDetails = asRecord(usage?.completion_tokens_details);
  const inputTokens = readToken(usage?.prompt_tokens);
  const outputTokens = readToken(usage?.completion_tokens);
  const totalTokens = readToken(usage?.total_tokens);
  return {
    cacheReadTokens: readToken(
      promptDetails?.cached_tokens
      ?? usage?.cache_read_tokens
      ?? usage?.cached_tokens,
    ),
    cacheWriteTokens: readToken(
      promptDetails?.cache_write_tokens
      ?? usage?.cache_write_tokens,
    ),
    complete: inputTokens !== null && outputTokens !== null && totalTokens !== null,
    inputTokens,
    outputTokens,
    providerCostUsd: readDecimal(usage?.cost),
    reasoningTokens: readToken(
      completionDetails?.reasoning_tokens
      ?? usage?.reasoning_tokens,
    ),
    totalTokens,
  };
}

function normalizeOpenRouterResult(
  raw: unknown,
  request: ProviderExecuteRequest,
): ProviderResult {
  const payload = asRecord(raw);
  if (!payload) throw createInvalidProviderResponseError();
  const providerOperationId = readString(payload, 'id');
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const choice = asRecord(choices[0]);
  const message = asRecord(choice?.message);
  if (!message) throw createInvalidProviderResponseError(providerOperationId);
  const outputs = normalizeOpenRouterOutputs(message);
  const actualModalities = new Set(outputs.map((output) => output.modality));
  const missingModalities = uniqueModalities(request.expectedOutputModalities)
    .filter((modality) => !actualModalities.has(modality));
  if (missingModalities.length > 0) {
    throw createMissingModalityError({
      actualModalities: Array.from(actualModalities),
      expectedModalities: missingModalities,
      providerOperationId,
    });
  }
  const metadata: ProviderSafeMetadata = {};
  setSafeMetadata(metadata, 'finishReason', choice?.finish_reason);
  setSafeMetadata(metadata, 'nativeFinishReason', choice?.native_finish_reason);
  setSafeMetadata(metadata, 'upstreamProvider', payload.provider);
  return {
    metadata,
    modelId: readString(payload, 'model') ?? request.modelId,
    outputs,
    provider: PROVIDER,
    providerOperationId,
    usage: normalizeOpenRouterProviderUsage(payload.usage),
  };
}

function normalizeOpenRouterOutputs(message: Record<string, unknown>): ProviderOutput[] {
  const outputs: ProviderOutput[] = [];
  if (typeof message.content === 'string' && message.content.length > 0) {
    outputs.push({ modality: 'text', text: message.content });
  } else if (Array.isArray(message.content)) {
    for (const rawPart of message.content) {
      const part = asRecord(rawPart);
      if (!part) continue;
      if ((part.type === 'text' || part.type === 'output_text') && typeof part.text === 'string') {
        outputs.push({ modality: 'text', text: part.text });
      } else if (part.type === 'image_url') {
        const imageUrl = asRecord(part.image_url);
        const url = typeof imageUrl?.url === 'string' ? imageUrl.url : null;
        if (url) outputs.push(toImageOutput(url));
      } else if (part.type === 'audio_url') {
        const audioUrl = asRecord(part.audio_url);
        const url = typeof audioUrl?.url === 'string' ? audioUrl.url : null;
        if (url) outputs.push({ modality: 'audio', url });
      } else if (part.type === 'output_audio' || part.type === 'audio') {
        const audio = asRecord(part.audio ?? part);
        const output = normalizeAudioOutput(audio);
        if (output) outputs.push(output);
      }
    }
  }

  if (Array.isArray(message.images)) {
    for (const rawImage of message.images) {
      const image = asRecord(rawImage);
      const imageUrl = asRecord(image?.image_url);
      const url = typeof imageUrl?.url === 'string' ? imageUrl.url : null;
      if (url) outputs.push(toImageOutput(url));
    }
  }

  const audio = asRecord(message.audio);
  const audioOutput = normalizeAudioOutput(audio);
  if (audioOutput) outputs.push(audioOutput);
  return outputs;
}

function normalizeOpenRouterCredentialSummary(raw: unknown): ProviderCredentialSummary {
  const payload = asRecord(raw);
  const data = asRecord(payload?.data);
  if (!data) throw createInvalidProviderResponseError();
  return {
    isFreeTier: typeof data.is_free_tier === 'boolean' ? data.is_free_tier : null,
    label: typeof data.label === 'string' ? data.label : null,
    limitRemainingUsd: readDecimal(data.limit_remaining),
    limitReset: typeof data.limit_reset === 'string' ? data.limit_reset : null,
    limitUsd: readDecimal(data.limit),
    usageDailyUsd: readDecimal(data.usage_daily),
    usageMonthlyUsd: readDecimal(data.usage_monthly),
    usageTotalUsd: readDecimal(data.usage),
    usageWeeklyUsd: readDecimal(data.usage_weekly),
  };
}

function normalizeOpenRouterModels(raw: unknown): ProviderModel[] {
  const payload = asRecord(raw);
  if (!Array.isArray(payload?.data)) throw createInvalidProviderResponseError();
  return payload.data.flatMap((rawModel) => {
    const model = asRecord(rawModel);
    if (!model || typeof model.id !== 'string' || !model.id) return [];
    const id = model.id;
    const architecture = asRecord(model.architecture);
    return [{
      id,
      inputModalities: normalizeModalities(architecture?.input_modalities),
      name: typeof model.name === 'string' ? model.name : id,
      outputModalities: normalizeModalities(architecture?.output_modalities),
    }];
  });
}

function normalizeOpenRouterOperationStatus(
  raw: unknown,
  providerOperationId: string,
): ProviderOperationStatus {
  const payload = asRecord(raw);
  const data = asRecord(payload?.data);
  if (!data) throw createInvalidProviderResponseError(providerOperationId);
  const promptTokens = readToken(data.tokens_prompt);
  const outputTokens = readToken(data.tokens_completion);
  const totalTokens = promptTokens !== null && outputTokens !== null
    ? promptTokens + outputTokens
    : null;
  const usage = normalizeOpenRouterProviderUsage({
    prompt_tokens: promptTokens,
    completion_tokens: outputTokens,
    total_tokens: totalTokens,
    cost: data.total_cost,
  });
  return {
    error: null,
    modelId: typeof data.model === 'string' ? data.model : null,
    providerOperationId,
    state: 'succeeded',
    usage,
  };
}

function toOpenRouterMessagePart(part: ProviderMessagePart) {
  if (part.modality === 'text') return { type: 'text', text: part.text };
  if (part.modality === 'image') {
    const url = resolveMediaUrl(part);
    return { type: 'image_url', image_url: { url } };
  }
  if (part.url) return { type: 'audio_url', audio_url: { url: part.url } };
  if (!part.data) {
    throw createPermanentAdapterError('invalid_request', 'Audio input requires data or url.');
  }
  return {
    type: 'input_audio',
    input_audio: {
      data: stripDataUrlPrefix(part.data),
      format: part.format ?? mediaTypeToAudioFormat(part.mediaType),
    },
  };
}

function resolveMediaUrl(part: { data?: string; mediaType?: string; url?: string }) {
  if (part.url) return part.url;
  if (!part.data) {
    throw createPermanentAdapterError('invalid_request', 'Image input requires data or url.');
  }
  if (part.data.startsWith('data:')) return part.data;
  if (!part.mediaType?.startsWith('image/')) {
    throw createPermanentAdapterError(
      'invalid_request',
      'Base64 image input requires an image media type.',
    );
  }
  return `data:${part.mediaType};base64,${part.data}`;
}

function normalizeAudioOutput(
  audio: Record<string, unknown> | null,
): ProviderAudioOutput | null {
  if (!audio) return null;
  const data = typeof audio.data === 'string' ? audio.data : undefined;
  const url = typeof audio.url === 'string' ? audio.url : undefined;
  if (!data && !url) return null;
  const format = typeof audio.format === 'string' ? audio.format : undefined;
  return {
    data,
    format,
    mediaType: format ? audioFormatToMediaType(format) : undefined,
    modality: 'audio',
    url,
  };
}

function toImageOutput(url: string): ProviderImageOutput {
  const dataUrl = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (!dataUrl) return { modality: 'image', url };
  return {
    data: dataUrl[2],
    mediaType: dataUrl[1],
    modality: 'image',
  };
}

function validateExecuteRequest(request: ProviderExecuteRequest) {
  if (!request.operation.trim() || !request.modelId.trim()) {
    throw createPermanentAdapterError(
      'invalid_request',
      'Provider operation and model are required.',
    );
  }
  if (request.messages.length === 0 || request.messages.some((message) => message.parts.length === 0)) {
    throw createPermanentAdapterError(
      'invalid_request',
      'Provider request requires at least one non-empty message.',
    );
  }
  if (uniqueModalities(request.expectedOutputModalities).length === 0) {
    throw createPermanentAdapterError(
      'invalid_request',
      'Provider request requires at least one expected output modality.',
    );
  }
}

function validateCredentialValue(credential: string) {
  if (!credential.trim()) {
    throw createPermanentAdapterError(
      'invalid_credential',
      'Provider credential is required.',
    );
  }
}

function createPermanentAdapterError(
  code: 'invalid_request' | 'invalid_credential',
  message: string,
) {
  return new ProviderAdapterError({
    classification: 'permanent',
    code,
    httpStatus: null,
    message,
    providerOperationId: null,
    retryAfterMs: null,
  });
}

async function readJsonSafely(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return {};
    throw createInvalidProviderResponseError();
  }
}

function readEmbeddedError(raw: unknown): {
  errorType: string | null;
  providerOperationId: string | null;
  status: number | null;
} | null {
  const payload = asRecord(raw);
  const error = asRecord(payload?.error);
  if (!error) return null;
  const metadata = asRecord(error.metadata);
  return {
    errorType: typeof metadata?.error_type === 'string'
      ? metadata.error_type
      : typeof payload?.error_type === 'string' ? payload.error_type : null,
    providerOperationId: readString(payload, 'id'),
    status: readToken(error.code),
  };
}

function normalizeModalities(value: unknown): ProviderModality[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(PROVIDER_MODALITIES);
  return Array.from(new Set(value.filter(
    (item): item is ProviderModality => typeof item === 'string' && allowed.has(item),
  )));
}

function uniqueModalities(value: ProviderModality[]) {
  return Array.from(new Set(value));
}

function readToken(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function readDecimal(value: unknown) {
  if (typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return trimDecimal(value);
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return trimDecimal(value.toFixed(12));
}

function trimDecimal(value: string) {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') || '0' : value;
}

function readString(value: unknown, key: string) {
  const record = asRecord(value);
  const candidate = record?.[key];
  return typeof candidate === 'string' && candidate ? candidate : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function setSafeMetadata(
  target: ProviderSafeMetadata,
  key: string,
  value: unknown,
) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    target[key] = value;
  }
}

function removeUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function stripDataUrlPrefix(value: string) {
  const match = value.match(/^data:[^;,]+;base64,(.+)$/);
  return match?.[1] ?? value;
}

function mediaTypeToAudioFormat(mediaType: string | undefined) {
  if (!mediaType) return 'wav';
  if (mediaType.includes('mpeg')) return 'mp3';
  if (mediaType.includes('ogg')) return 'ogg';
  if (mediaType.includes('webm')) return 'webm';
  return 'wav';
}

function audioFormatToMediaType(format: string) {
  if (format === 'mp3') return 'audio/mpeg';
  if (format === 'ogg') return 'audio/ogg';
  if (format === 'webm') return 'audio/webm';
  if (format === 'pcm') return 'audio/L16';
  return 'audio/wav';
}

function normalizeTimeout(value: number | undefined) {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10 * 60_000) {
    throw new Error('OpenRouter request timeout must be between 1 and 600000 milliseconds.');
  }
  return value;
}

function readRetryAfterMs(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - Date.now());
}
