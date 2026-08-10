import type { GenerationJobRecord } from './generation-job-repository';
import type { GenerationJobDto } from './generation-orchestrator-contracts';

export function toGenerationJobDto(
  record: GenerationJobRecord,
  idempotentReplay: boolean,
): GenerationJobDto {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    provider: record.provider,
    modelId: record.modelId,
    operation: record.operation,
    idempotencyKey: record.idempotencyKey,
    idempotentReplay,
    requestObjectKey: record.requestObjectKey,
    resultObjectKey: record.resultObjectKey,
    providerOperationId: record.providerOperationId,
    queueJobId: record.queueJobId,
    status: record.status,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    finalAssetId: record.finalAssetId,
    leaseExpiresAt: record.status === 'running' ? record.leaseExpiresAt?.toISOString() ?? null : null,
    retryAvailableAt: record.retryAvailableAt?.toISOString() ?? null,
    usage: {
      complete: record.usageComplete,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      providerCostUsd: record.providerCostUsd,
      internalCreditsCharged: record.internalCreditsCharged,
      internalCreditsBalanceAfter: record.internalCreditsBalanceAfter,
    },
    error: record.errorCode && record.errorMessage
      ? { code: record.errorCode, message: record.errorMessage, retryable: record.retryable ?? false }
      : null,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    enqueuedAt: record.enqueuedAt?.toISOString() ?? null,
    startedAt: record.startedAt?.toISOString() ?? null,
    cancelRequestedAt: record.cancelRequestedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  };
}
