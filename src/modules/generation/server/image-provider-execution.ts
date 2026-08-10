import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import {
  ProviderAdapterError,
  type ProviderAdapter,
  type ProviderResult,
} from '@/modules/provider-connections';
import {
  markOpenRouterProviderUsed,
  resolveOpenRouterCredentialForWorkspace,
} from '@/modules/provider-connections/server/provider-connection-service';
import {
  assertActiveGenerationAttempt,
  clearProviderCallDispatch,
  type getGenerationExecutionRecord,
  markProviderCallDispatched,
  saveProviderCheckpoint,
  saveProviderOperationId,
} from './generation-execution-repository';
import {
  readProviderFailureUsage,
  recordSuccessfulUsage,
  recordUsageEventWithRetry,
  toGenerationUsage,
  toGenerationUsageFromProviderUsage,
} from './generation-usage-recorder';
import type {
  ProviderResultCheckpoint,
  QueuedGenerateImagePayload,
} from './image-generation-contracts';
import { createProviderRequest } from './image-provider-request';
import { GenerationExecutionError } from './generation-worker';
import type { createGenerationPayloadStore } from './generation-payload-store';
import { writeProviderCheckpointReliably } from './provider-result-checkpoint';

type JobRecord = Awaited<ReturnType<typeof getGenerationExecutionRecord>>;
type SavedCheckpoint = { checkpoint: ProviderResultCheckpoint; key: string } | null;

export async function executeImageProvider(input: {
  job: GenerationJobDto;
  jobRecord: JobRecord;
  payload: QueuedGenerateImagePayload;
  payloadStore: ReturnType<typeof createGenerationPayloadStore>;
  provider: ProviderAdapter;
  savedCheckpoint: SavedCheckpoint;
  signal: AbortSignal;
}) {
  if (input.savedCheckpoint) return reuseCheckpoint(input);
  const resolvedCredential = await resolveOpenRouterCredentialForWorkspace(input.job.workspaceId);
  await reconcilePreviousDispatch(input, resolvedCredential.apiKey);
  await assertActiveGenerationAttempt(input.job.id, input.job.attemptCount, input.signal);
  await markProviderCallDispatched(input.job.id, input.job.attemptCount);

  let result: ProviderResult;
  try {
    result = await input.provider.execute(createProviderRequest(input.payload), {
      credential: resolvedCredential.apiKey,
      signal: input.signal,
    });
  } catch (error) {
    throw await handleProviderFailure(input, error);
  }
  await markOpenRouterProviderUsed(resolvedCredential.connection.id).catch(logProviderUsageMarkerFailure);
  await recordSuccessfulUsage(input.job.id, input.job.attemptCount, result, true);
  await checkpointProviderResult(input, result);
  return { providerCalled: true, result, usageAttemptCount: input.job.attemptCount };
}

async function reuseCheckpoint(input: Parameters<typeof executeImageProvider>[0]) {
  const saved = input.savedCheckpoint!;
  if (!input.jobRecord.resultObjectKey) {
    await saveProviderCheckpoint({
      attemptCount: input.job.attemptCount,
      jobId: input.job.id,
      providerOperationId: saved.checkpoint.result.providerOperationId,
      resultObjectKey: saved.key,
    });
  }
  await recordSuccessfulUsage(
    input.job.id,
    saved.checkpoint.attemptCount,
    saved.checkpoint.result,
    true,
  );
  return {
    providerCalled: false,
    result: saved.checkpoint.result,
    usageAttemptCount: saved.checkpoint.attemptCount,
  };
}

async function reconcilePreviousDispatch(
  input: Parameters<typeof executeImageProvider>[0],
  credential: string,
) {
  if (input.jobRecord.providerDispatchedAt && !input.jobRecord.providerOperationId) {
    throw new GenerationExecutionError({
      code: 'provider_outcome_unknown',
      message: 'A previous provider call was dispatched without a durable response. Automatic retry is blocked to prevent duplicate charges.',
      retryable: false,
    });
  }
  if (!input.jobRecord.providerOperationId) return;
  const status = await input.provider.getOperationStatus(input.jobRecord.providerOperationId, {
    credential,
    signal: input.signal,
  });
  await recordUsageEventWithRetry({
    generationJobId: input.job.id,
    attemptCount: Math.max(1, input.job.attemptCount - 1),
    succeeded: status.state === 'succeeded',
    inputTokens: status.usage.inputTokens,
    outputTokens: status.usage.outputTokens,
    totalTokens: status.usage.totalTokens,
    providerCostUsd: status.usage.providerCostUsd,
    providerOperationId: status.providerOperationId,
    errorCode: status.error?.code ?? 'provider_reconciliation_required',
    metadata: {
      classification: status.error?.classification ?? 'ambiguous',
      reconciliationState: status.state,
    },
  }, status.usage);
  throw new GenerationExecutionError({
    code: 'provider_reconciliation_required',
    message: 'The previous provider operation was accepted but its image result cannot be safely replayed.',
    retryable: false,
    usage: toGenerationUsageFromProviderUsage(status.usage),
  });
}

async function handleProviderFailure(
  input: Parameters<typeof executeImageProvider>[0],
  error: unknown,
) {
  const failureUsage = readProviderFailureUsage(error);
  const providerError = error instanceof ProviderAdapterError
    ? error
    : new ProviderAdapterError(input.provider.classifyError(error, { requestDispatched: true }), error);
  await recordUsageEventWithRetry({
    generationJobId: input.job.id,
    attemptCount: input.job.attemptCount,
    succeeded: false,
    inputTokens: failureUsage.inputTokens,
    outputTokens: failureUsage.outputTokens,
    totalTokens: failureUsage.totalTokens,
    providerCostUsd: failureUsage.providerCostUsd,
    providerOperationId: providerError.descriptor.providerOperationId,
    errorCode: providerError.descriptor.code,
    metadata: { classification: providerError.descriptor.classification },
  }, failureUsage);
  if (providerError.descriptor.providerOperationId) {
    await saveProviderOperationId({
      attemptCount: input.job.attemptCount,
      jobId: input.job.id,
      providerOperationId: providerError.descriptor.providerOperationId,
    });
  } else if (providerError.descriptor.classification !== 'ambiguous') {
    await clearProviderCallDispatch(input.job.id, input.job.attemptCount);
  }
  return new GenerationExecutionError({
    code: providerError.descriptor.code,
    message: providerError.descriptor.message,
    retryable: providerError.descriptor.classification === 'retryable'
      && providerError.descriptor.providerOperationId === null,
    usage: toGenerationUsageFromProviderUsage(failureUsage),
  });
}

async function checkpointProviderResult(
  input: Parameters<typeof executeImageProvider>[0],
  result: ProviderResult,
) {
  let resultObjectKey: string;
  try {
    resultObjectKey = await writeProviderCheckpointReliably(input.payloadStore, {
      attemptCount: input.job.attemptCount,
      jobId: input.job.id,
      kind: 'result',
      payload: { attemptCount: input.job.attemptCount, result, version: 1 },
      workspaceId: input.job.workspaceId,
    });
  } catch {
    throw new GenerationExecutionError({
      code: 'generation_checkpoint_failed',
      message: 'Provider result could not be durably checkpointed.',
      retryable: false,
      usage: toGenerationUsage(result),
    });
  }
  try {
    await saveProviderCheckpoint({
      attemptCount: input.job.attemptCount,
      jobId: input.job.id,
      providerOperationId: result.providerOperationId,
      resultObjectKey,
    });
  } catch {
    throw new GenerationExecutionError({
      code: 'generation_checkpoint_link_failed',
      message: 'Provider result was saved but could not be linked to the job yet.',
      retryable: true,
      usage: toGenerationUsage(result),
    });
  }
}

function logProviderUsageMarkerFailure(error: unknown) {
  console.error('[generation:provider] failed to update last-used timestamp', {
    error: error instanceof Error ? error.message : 'unknown error',
  });
}
