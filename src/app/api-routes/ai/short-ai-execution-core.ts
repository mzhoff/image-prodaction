import type {
  CreateGenerationJobInput,
  GenerationFailureUsageInput,
  GenerationUsageInput,
} from '@/entities/generation/server/generation-orchestrator';
import {
  EMPTY_PROVIDER_USAGE,
  ProviderHttpError,
  type ProviderAdapter,
  type ProviderErrorDescriptor,
  type ProviderExecuteRequest,
  type ProviderResult,
  type ProviderUsage,
} from '@/modules/provider-connections';
import type { RecordUsageEventInput } from '@/modules/usage';
import { resolveRequestId } from '@/shared/api/request-id';

export interface ShortAiScope {
  documentId?: string;
  idempotencyKey?: string;
  workspaceId: string;
}

interface ProviderCallResult<T> {
  providerOperationId: string | null;
  result: T;
  usage: ProviderUsage;
}

export interface ShortAiExecutionDependencies {
  adapter: ProviderAdapter;
  createJob(input: CreateGenerationJobInput): Promise<{
    id: string;
    idempotentReplay: boolean;
    resultObjectKey?: string | null;
    status: string;
  }>;
  failJob(input: {
    attemptCount: number;
    errorCode: string;
    errorMessage: string;
    jobId: string;
    retryable: boolean;
    usage?: GenerationFailureUsageInput;
  }): Promise<unknown>;
  markProviderDispatched(input: {
    attemptCount: number;
    jobId: string;
  }): Promise<void>;
  markProviderUsed(connectionId: string): Promise<void>;
  recordUsage(input: RecordUsageEventInput): Promise<unknown>;
  readResult(resultObjectKey: string): Promise<unknown>;
  resolveCredential(userId: string, workspaceId: string): Promise<{
    apiKey: string;
    connection: { id: string };
  }>;
  startJob(jobId: string): Promise<{ attemptCount: number }>;
  saveResult(input: {
    attemptCount: number;
    jobId: string;
    payload: unknown;
    providerOperationId: string | null;
    workspaceId: string;
  }): Promise<void>;
  succeedJob(input: {
    attemptCount: number;
    jobId: string;
    usage: GenerationUsageInput;
  }): Promise<unknown>;
  userId(request: Request): Promise<string>;
}

export class ShortAiExecutionError extends Error {
  readonly descriptor: ProviderErrorDescriptor;

  constructor(descriptor: ProviderErrorDescriptor) {
    super(descriptor.message);
    this.name = 'ShortAiExecutionError';
    this.descriptor = descriptor;
  }
}

export async function executeShortOpenRouterChatCore<T>(input: {
  request: Request;
  scope: ShortAiScope;
  providerRequest: ProviderExecuteRequest;
  transform(result: ProviderResult): T | Promise<T>;
}, dependencies: ShortAiExecutionDependencies) {
  return executeShortOpenRouterCallCore({
    request: input.request,
    scope: input.scope,
    modelId: input.providerRequest.modelId,
    operation: input.providerRequest.operation,
    invoke: async ({ adapter, apiKey }) => {
      const result = await adapter.execute(input.providerRequest, {
        credential: apiKey,
        signal: input.request.signal,
      });
      return {
        providerOperationId: result.providerOperationId,
        result,
        usage: result.usage,
      };
    },
    transform: input.transform,
  }, dependencies);
}

export async function executeShortOpenRouterCallCore<TProvider, TResult>(input: {
  checkpoint?: {
    deserialize(value: unknown): TResult;
    serialize(result: TResult): unknown;
  };
  invoke(context: {
    adapter: ProviderAdapter;
    apiKey: string;
  }): Promise<ProviderCallResult<TProvider>>;
  modelId: string;
  operation: string;
  request: Request;
  scope: ShortAiScope;
  transform(result: TProvider): TResult | Promise<TResult>;
}, dependencies: ShortAiExecutionDependencies) {
  const userId = await dependencies.userId(input.request);
  const idempotencyKey = input.scope.idempotencyKey
    ?? resolveRequestId(input.request.headers.get('x-request-id'));
  const job = await dependencies.createJob({
    documentId: input.scope.documentId ?? null,
    idempotencyKey,
    maxAttempts: 1,
    metadata: null,
    modelId: input.modelId,
    operation: input.operation,
    provider: 'openrouter',
    userId,
    workspaceId: input.scope.workspaceId,
  });
  if (job.idempotentReplay) {
    if (job.status === 'succeeded' && job.resultObjectKey) {
      try {
        const saved = await dependencies.readResult(job.resultObjectKey);
        return {
          job: { id: job.id },
          result: input.checkpoint
            ? input.checkpoint.deserialize(saved)
            : saved as TResult,
        };
      } catch {
        throw new ShortAiExecutionError({
          classification: 'permanent',
          code: 'invalid_response',
          httpStatus: 502,
          message: 'The saved AI result could not be restored.',
          providerOperationId: null,
          retryAfterMs: null,
        });
      }
    }
    throw new ShortAiExecutionError({
      classification: 'permanent',
      code: 'invalid_request',
      httpStatus: 409,
      message: job.status === 'succeeded'
        ? 'This AI request has already been completed.'
        : 'This AI request has already been accepted.',
      providerOperationId: null,
      retryAfterMs: null,
    });
  }

  const credential = await dependencies.resolveCredential(userId, input.scope.workspaceId);
  const started = await dependencies.startJob(job.id);
  let callResult: ProviderCallResult<TProvider> | null = null;
  let providerCallStarted = false;
  let usageRecorded = false;

  try {
    await dependencies.markProviderDispatched({
      attemptCount: started.attemptCount,
      jobId: job.id,
    });
    providerCallStarted = true;
    callResult = await input.invoke({
      adapter: dependencies.adapter,
      apiKey: credential.apiKey,
    });
    await markProviderUsedSafely(dependencies, credential.connection.id);
    await recordUsageReliably(dependencies, {
      attemptCount: started.attemptCount,
      generationJobId: job.id,
      inputTokens: callResult.usage.inputTokens,
      outputTokens: callResult.usage.outputTokens,
      providerCostUsd: normalizeCost(callResult.usage.providerCostUsd),
      providerOperationId: callResult.providerOperationId,
      succeeded: true,
      totalTokens: callResult.usage.totalTokens,
    });
    usageRecorded = true;

    let transformed: TResult;
    try {
      transformed = await input.transform(callResult.result);
    } catch {
      throw new ShortAiExecutionError({
        classification: 'permanent',
        code: 'invalid_response',
        httpStatus: 502,
        message: 'Provider returned a response that the application could not process.',
        providerOperationId: callResult.providerOperationId,
        retryAfterMs: null,
      });
    }

    await dependencies.saveResult({
      attemptCount: started.attemptCount,
      jobId: job.id,
      payload: input.checkpoint
        ? input.checkpoint.serialize(transformed)
        : transformed,
      providerOperationId: callResult.providerOperationId,
      workspaceId: input.scope.workspaceId,
    });
    await dependencies.succeedJob({
      attemptCount: started.attemptCount,
      jobId: job.id,
      usage: toGenerationUsage(callResult.usage),
    });
    return {
      job: { id: job.id },
      result: transformed,
    };
  } catch (error) {
    if (providerCallStarted && !callResult) {
      await markProviderUsedSafely(dependencies, credential.connection.id);
    }
    const descriptor = error instanceof ShortAiExecutionError
      ? error.descriptor
      : dependencies.adapter.classifyError(error, {
        providerOperationId: callResult?.providerOperationId,
        requestDispatched: providerCallStarted,
      });
    const failureUsage = callResult?.usage ?? readProviderFailureUsage(error);
    if (providerCallStarted && !usageRecorded) {
      await recordUsageReliably(dependencies, {
        attemptCount: started.attemptCount,
        errorCode: descriptor.code,
        generationJobId: job.id,
        inputTokens: failureUsage.inputTokens,
        outputTokens: failureUsage.outputTokens,
        providerCostUsd: normalizeCost(failureUsage.providerCostUsd),
        providerOperationId: callResult?.providerOperationId
          ?? descriptor.providerOperationId,
        succeeded: callResult !== null,
        totalTokens: failureUsage.totalTokens,
      });
    }
    await dependencies.failJob({
      attemptCount: started.attemptCount,
      errorCode: descriptor.code,
      errorMessage: descriptor.message,
      jobId: job.id,
      retryable: false,
      usage: toGenerationUsage(failureUsage),
    });
    throw new ShortAiExecutionError(descriptor);
  }
}

export function getProviderText(result: ProviderResult) {
  const output = result.outputs.find((candidate) => candidate.modality === 'text');
  if (!output || output.modality !== 'text' || !output.text.trim()) {
    throw new Error('Provider response does not contain text.');
  }
  return output.text.trim();
}

export function createEmptyProviderCallResult<T>(
  result: T,
  providerOperationId: string | null = null,
): ProviderCallResult<T> {
  return {
    providerOperationId,
    result,
    usage: { ...EMPTY_PROVIDER_USAGE },
  };
}

async function markProviderUsedSafely(
  dependencies: ShortAiExecutionDependencies,
  connectionId: string,
) {
  try {
    await dependencies.markProviderUsed(connectionId);
  } catch {
    console.error('OpenRouter provider last-used timestamp could not be updated.');
  }
}

async function recordUsageReliably(
  dependencies: ShortAiExecutionDependencies,
  input: RecordUsageEventInput,
) {
  try {
    await dependencies.recordUsage(input);
  } catch {
    await dependencies.recordUsage(input);
  }
}

function toGenerationUsage(usage: ProviderUsage): GenerationUsageInput {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    providerCostUsd: normalizeCost(usage.providerCostUsd),
    totalTokens: usage.totalTokens,
  };
}

function normalizeCost(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed.toFixed(8).replace(/\.?0+$/, '') || '0';
}

function readProviderFailureUsage(error: unknown): ProviderUsage {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current instanceof ProviderHttpError && current.usage) return current.usage;
    current = current.cause;
  }
  return { ...EMPTY_PROVIDER_USAGE };
}
