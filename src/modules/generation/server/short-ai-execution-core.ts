import type {
  ProviderAdapter,
  ProviderExecuteRequest,
  ProviderResult,
} from '@/modules/provider-connections';
import { resolveRequestId } from '@/shared/api/request-id';
import {
  ShortAiExecutionError,
  type ProviderCallResult,
  type ShortAiExecutionDependencies,
  type ShortAiScope,
} from './short-ai-execution-contracts';
import {
  markProviderUsedSafely,
  normalizeCost,
  readProviderFailureUsage,
  recordUsageReliably,
  toGenerationUsage,
} from './short-ai-execution-support';

export * from './short-ai-execution-contracts';
export { createEmptyProviderCallResult } from './short-ai-execution-support';

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
      return { providerOperationId: result.providerOperationId, result, usage: result.usage };
    },
    transform: input.transform,
  }, dependencies);
}

export async function executeShortOpenRouterCallCore<TProvider, TResult>(input: {
  checkpoint?: { deserialize(value: unknown): TResult; serialize(result: TResult): unknown };
  invoke(context: { adapter: ProviderAdapter; apiKey: string }): Promise<ProviderCallResult<TProvider>>;
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
    metadata: input.scope.metadata ?? null,
    modelId: input.modelId,
    operation: input.operation,
    provider: 'openrouter',
    userId,
    workspaceId: input.scope.workspaceId,
  });
  if (job.idempotentReplay) return restoreIdempotentResult(input, dependencies, job);

  const credential = await dependencies.resolveCredential(userId, input.scope.workspaceId);
  const started = await dependencies.startJob(job.id);
  let callResult: ProviderCallResult<TProvider> | null = null;
  let providerCallStarted = false;
  let usageRecorded = false;
  try {
    await dependencies.markProviderDispatched({ attemptCount: started.attemptCount, jobId: job.id });
    providerCallStarted = true;
    callResult = await input.invoke({ adapter: dependencies.adapter, apiKey: credential.apiKey });
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
    const transformed = await transformSafely(input, callResult);
    await dependencies.saveResult({
      attemptCount: started.attemptCount,
      jobId: job.id,
      payload: input.checkpoint ? input.checkpoint.serialize(transformed) : transformed,
      providerOperationId: callResult.providerOperationId,
      workspaceId: input.scope.workspaceId,
    });
    await dependencies.succeedJob({
      attemptCount: started.attemptCount,
      jobId: job.id,
      usage: toGenerationUsage(callResult.usage),
    });
    return { job: { id: job.id }, result: transformed };
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
        providerOperationId: callResult?.providerOperationId ?? descriptor.providerOperationId,
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

async function restoreIdempotentResult<TProvider, TResult>(
  input: Parameters<typeof executeShortOpenRouterCallCore<TProvider, TResult>>[0],
  dependencies: ShortAiExecutionDependencies,
  job: { id: string; resultObjectKey?: string | null; status: string },
) {
  if (job.status === 'succeeded' && job.resultObjectKey) {
    try {
      const saved = await dependencies.readResult(job.resultObjectKey);
      return {
        job: { id: job.id },
        result: input.checkpoint ? input.checkpoint.deserialize(saved) : saved as TResult,
      };
    } catch {
      throw shortAiError('invalid_response', 502, 'The saved AI result could not be restored.');
    }
  }
  throw shortAiError(
    'invalid_request',
    409,
    job.status === 'succeeded'
      ? 'This AI request has already been completed.'
      : 'This AI request has already been accepted.',
  );
}

async function transformSafely<TProvider, TResult>(
  input: Parameters<typeof executeShortOpenRouterCallCore<TProvider, TResult>>[0],
  callResult: ProviderCallResult<TProvider>,
) {
  try {
    return await input.transform(callResult.result);
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
}

function shortAiError(code: 'invalid_request' | 'invalid_response', httpStatus: number, message: string) {
  return new ShortAiExecutionError({
    classification: 'permanent', code, httpStatus, message,
    providerOperationId: null, retryAfterMs: null,
  });
}
