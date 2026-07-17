import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  createGenerationJob,
  getGenerationJob,
  type CreateGenerationJobInput,
  type GenerationJobDto,
} from '@/entities/generation/server/generation-orchestrator';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import {
  createGenerationPayloadStore,
  type GenerationPayloadStore,
} from './generation-payload-store';

export async function submitGenerationJob<TPayload>(
  input: CreateGenerationJobInput & { payload: TPayload },
  payloadStore: GenerationPayloadStore = createGenerationPayloadStore(),
) {
  const job = await createGenerationJob(input);
  if (
    job.idempotentReplay
    && (
      job.status === 'succeeded'
      || job.status === 'canceled'
      || (job.status === 'failed' && !job.error?.retryable)
    )
  ) {
    return job;
  }
  if (job.requestObjectKey && job.enqueuedAt) return job;

  const requestObjectKey = await payloadStore.write({
    jobId: job.id,
    kind: 'request',
    payload: input.payload,
    workspaceId: input.workspaceId,
  });
  const now = new Date();
  const [updated] = await getDb().update(generationJob).set({
    requestObjectKey,
    enqueuedAt: now,
    retryAvailableAt: job.status === 'failed' ? now : null,
    updatedAt: now,
  }).where(and(
    eq(generationJob.id, job.id),
    inArray(generationJob.status, ['queued', 'failed']),
    isNull(generationJob.cancelRequestedAt),
  )).returning();
  if (!updated) {
    await payloadStore.delete(requestObjectKey).catch(() => undefined);
    return getGenerationJob(input.userId, job.id);
  }
  return getGenerationJob(input.userId, job.id);
}

export async function cancelGenerationJob(userId: string, jobId: string) {
  const accessible = await getGenerationJob(userId, jobId);
  if (['succeeded', 'failed', 'canceled'].includes(accessible.status)) {
    return accessible;
  }
  const now = new Date();
  const [canceledQueuedJob] = await getDb().update(generationJob).set({
    status: 'canceled',
    cancelRequestedAt: now,
    leaseExpiresAt: null,
    retryAvailableAt: null,
    retryable: false,
    finishedAt: now,
    updatedAt: now,
  }).where(and(
    eq(generationJob.id, jobId),
    eq(generationJob.status, 'queued'),
  )).returning({ id: generationJob.id });
  if (!canceledQueuedJob) {
    await getDb().update(generationJob).set({
      cancelRequestedAt: now,
      retryAvailableAt: null,
      updatedAt: now,
    }).where(and(
      eq(generationJob.id, jobId),
      eq(generationJob.status, 'running'),
    ));
  }
  return getGenerationJob(userId, jobId);
}

export function toPublicGenerationJob(job: GenerationJobDto) {
  const publicStatus = job.cancelRequestedAt && job.status === 'running'
    ? 'canceled'
    : job.status;
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    documentId: job.documentId,
    provider: job.provider,
    modelId: job.modelId,
    operation: job.operation,
    status: publicStatus,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    finalAssetId: job.finalAssetId,
    leaseExpiresAt: job.leaseExpiresAt,
    retryAvailableAt: job.retryAvailableAt ?? null,
    error: publicStatus === 'canceled' && !job.error
      ? {
          code: 'generation_canceled',
          message: 'Generation was canceled by the user.',
          retryable: false,
        }
      : job.error,
    usage: job.usage,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    updatedAt: job.updatedAt,
  };
}
