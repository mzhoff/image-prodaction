import type { PipelineRunJob } from '../../contracts/pipeline-contracts';
import { pipelineRun } from './pipeline-schema';

export type PipelineRunRecord = typeof pipelineRun.$inferSelect;

export function toPipelineRunJob(record: PipelineRunRecord): PipelineRunJob {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    pipelineId: record.pipelineId,
    pipelineVersion: record.pipelineVersion,
    sourceApplication: record.sourceApplication,
    idempotencyKey: record.idempotencyKey,
    requestFingerprint: record.requestFingerprint,
    input: structuredClone(record.inputPayload),
    status: record.status,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    leaseExpiresAt: cloneDate(record.leaseExpiresAt),
    retryAvailableAt: cloneDate(record.retryAvailableAt),
    retryable: record.retryable,
    cancelRequestedAt: cloneDate(record.cancelRequestedAt),
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    createdAt: new Date(record.createdAt),
    startedAt: cloneDate(record.startedAt),
    finishedAt: cloneDate(record.finishedAt),
  };
}

function cloneDate(value: Date | null) {
  return value ? new Date(value) : null;
}
