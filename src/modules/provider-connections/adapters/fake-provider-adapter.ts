import {
  EMPTY_PROVIDER_USAGE,
  type ProviderAdapter,
  type ProviderCallContext,
  type ProviderCredentialSummary,
  type ProviderExecuteRequest,
  type ProviderModel,
  type ProviderOperationStatus,
  type ProviderOutput,
  type ProviderResult,
  type ProviderUsage,
} from '../contracts/provider-contracts';
import type {
  ProviderErrorClassificationContext,
  ProviderErrorDescriptor,
} from '../contracts/provider-error-contracts';
import {
  ProviderAdapterError,
  classifyProviderError,
  createMissingModalityError,
} from '../core/provider-errors';

const DEFAULT_CREDENTIAL = 'fake-valid-credential';

export interface FakeProviderAdapterOptions {
  acceptedCredential?: string;
  credentialSummary?: Partial<ProviderCredentialSummary>;
  executeError?: unknown;
  models?: ProviderModel[];
  omittedModalities?: Array<'text' | 'image' | 'audio'>;
  provider?: string;
  usage?: Partial<ProviderUsage>;
}

export interface FakeProviderAdapter extends ProviderAdapter {
  readonly executeRequests: ProviderExecuteRequest[];
}

export function createFakeProviderAdapter(
  options: FakeProviderAdapterOptions = {},
): FakeProviderAdapter {
  const acceptedCredential = options.acceptedCredential ?? DEFAULT_CREDENTIAL;
  const provider = options.provider ?? 'fake';
  const executeRequests: ProviderExecuteRequest[] = [];
  const operations = new Map<string, ProviderResult>();
  let sequence = 0;

  return {
    provider,
    executeRequests,

    classifyError(
      error: unknown,
      context?: ProviderErrorClassificationContext,
    ): ProviderErrorDescriptor {
      return classifyProviderError(error, context);
    },

    async execute(request, context) {
      assertCredential(context, acceptedCredential);
      if (context.signal?.aborted) {
        throw new ProviderAdapterError({
          classification: 'permanent',
          code: 'canceled',
          httpStatus: null,
          message: 'Provider request was canceled.',
          providerOperationId: null,
          retryAfterMs: null,
        });
      }
      if (options.executeError !== undefined) throw options.executeError;
      executeRequests.push(structuredClone(request));
      const providerOperationId = `fake-operation-${++sequence}`;
      const omitted = new Set(options.omittedModalities ?? []);
      const outputs = request.expectedOutputModalities
        .filter((modality) => !omitted.has(modality))
        .map(createFakeOutput);
      const actualModalities = new Set(outputs.map((output) => output.modality));
      const missingModalities = request.expectedOutputModalities.filter(
        (modality) => !actualModalities.has(modality),
      );
      if (missingModalities.length > 0) {
        throw createMissingModalityError({
          actualModalities: Array.from(actualModalities),
          expectedModalities: missingModalities,
          providerOperationId,
        });
      }
      const result: ProviderResult = {
        metadata: { fake: true, operation: request.operation },
        modelId: request.modelId,
        outputs,
        provider,
        providerOperationId,
        usage: {
          cacheReadTokens: options.usage?.cacheReadTokens ?? 0,
          cacheWriteTokens: options.usage?.cacheWriteTokens ?? 0,
          complete: options.usage?.complete ?? true,
          inputTokens: options.usage?.inputTokens ?? 10,
          outputTokens: options.usage?.outputTokens ?? 5,
          providerCostUsd: options.usage?.providerCostUsd ?? '0.001',
          reasoningTokens: options.usage?.reasoningTokens ?? 0,
          totalTokens: options.usage?.totalTokens ?? 15,
        },
      };
      operations.set(providerOperationId, result);
      return result;
    },

    async getCredentialSummary(context) {
      assertCredential(context, acceptedCredential);
      return {
        isFreeTier: options.credentialSummary?.isFreeTier ?? false,
        label: options.credentialSummary?.label ?? 'Fake test credential',
        limitRemainingUsd: options.credentialSummary?.limitRemainingUsd ?? '99',
        limitReset: options.credentialSummary?.limitReset ?? null,
        limitUsd: options.credentialSummary?.limitUsd ?? '100',
        usageDailyUsd: options.credentialSummary?.usageDailyUsd ?? '0.1',
        usageMonthlyUsd: options.credentialSummary?.usageMonthlyUsd ?? '0.5',
        usageTotalUsd: options.credentialSummary?.usageTotalUsd ?? '1',
        usageWeeklyUsd: options.credentialSummary?.usageWeeklyUsd ?? '0.2',
      };
    },

    async getOperationStatus(providerOperationId, context) {
      assertCredential(context, acceptedCredential);
      const operation = operations.get(providerOperationId);
      if (!operation) {
        return {
          error: null,
          modelId: null,
          providerOperationId,
          state: 'unknown',
          usage: { ...EMPTY_PROVIDER_USAGE },
        };
      }
      return {
        error: null,
        modelId: operation.modelId,
        providerOperationId,
        state: 'succeeded',
        usage: operation.usage,
      };
    },

    async listModels(context) {
      assertCredential(context, acceptedCredential);
      return options.models ?? [{
        id: 'fake/image-model',
        inputModalities: ['text', 'image'],
        name: 'Fake image model',
        outputModalities: ['text', 'image'],
      }, {
        id: 'fake/audio-model',
        inputModalities: ['text'],
        name: 'Fake audio model',
        outputModalities: ['audio'],
      }];
    },

    normalizeUsage(rawUsage) {
      return normalizeFakeUsage(rawUsage);
    },

    async validateCredential(context) {
      return this.getCredentialSummary(context);
    },
  };
}

function assertCredential(
  context: ProviderCallContext,
  acceptedCredential: string,
) {
  if (context.credential !== acceptedCredential) {
    throw new ProviderAdapterError({
      classification: 'permanent',
      code: 'invalid_credential',
      httpStatus: 401,
      message: 'Provider credential is invalid or revoked.',
      providerOperationId: null,
      retryAfterMs: null,
    });
  }
}

function createFakeOutput(
  modality: 'text' | 'image' | 'audio',
): ProviderOutput {
  if (modality === 'text') return { modality: 'text', text: 'Fake provider response.' };
  if (modality === 'image') {
    return {
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      mediaType: 'image/png',
      modality: 'image',
    };
  }
  return {
    data: 'ZmFrZS1hdWRpbw==',
    format: 'mp3',
    mediaType: 'audio/mpeg',
    modality: 'audio',
  };
}

function normalizeFakeUsage(rawUsage: unknown): ProviderUsage {
  const raw = rawUsage && typeof rawUsage === 'object' && !Array.isArray(rawUsage)
    ? rawUsage as Record<string, unknown>
    : {};
  const inputTokens = readToken(raw.inputTokens);
  const outputTokens = readToken(raw.outputTokens);
  const totalTokens = readToken(raw.totalTokens);
  return {
    cacheReadTokens: readToken(raw.cacheReadTokens),
    cacheWriteTokens: readToken(raw.cacheWriteTokens),
    complete: inputTokens !== null && outputTokens !== null && totalTokens !== null,
    inputTokens,
    outputTokens,
    providerCostUsd: readDecimal(raw.providerCostUsd),
    reasoningTokens: readToken(raw.reasoningTokens),
    totalTokens,
  };
}

function readToken(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function readDecimal(value: unknown) {
  return typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    ? value
    : null;
}
