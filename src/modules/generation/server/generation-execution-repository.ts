import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { GenerationExecutionError } from './generation-worker';

export async function getGenerationExecutionRecord(jobId: string) {
  const [record] = await getDb().select().from(generationJob)
    .where(eq(generationJob.id, jobId))
    .limit(1);
  if (!record) throw executionError('generation_job_missing', 'Generation job no longer exists.', false);
  return record;
}

export async function saveProviderCheckpoint(input: {
  attemptCount: number;
  jobId: string;
  providerOperationId: string | null;
  resultObjectKey: string;
}) {
  const [updated] = await getDb().update(generationJob).set({
    providerOperationId: input.providerOperationId,
    resultObjectKey: input.resultObjectKey,
    updatedAt: new Date(),
  }).where(and(
    eq(generationJob.id, input.jobId),
    eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, input.attemptCount),
  )).returning({ id: generationJob.id });
  if (!updated) throw new Error('Generation job lease was lost before checkpoint.');
}

export async function saveProviderOperationId(input: {
  attemptCount: number;
  jobId: string;
  providerOperationId: string;
}) {
  const [updated] = await getDb().update(generationJob).set({
    providerOperationId: input.providerOperationId,
    updatedAt: new Date(),
  }).where(and(
    eq(generationJob.id, input.jobId),
    eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, input.attemptCount),
    isNull(generationJob.cancelRequestedAt),
  )).returning({ id: generationJob.id });
  if (!updated) throw attemptOwnershipError();
}

export async function markProviderCallDispatched(jobId: string, attemptCount: number) {
  const now = new Date();
  const [updated] = await getDb().update(generationJob).set({
    providerDispatchedAt: now,
    providerDispatchedAttempt: attemptCount,
    updatedAt: now,
  }).where(and(
    eq(generationJob.id, jobId),
    eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, attemptCount),
    isNull(generationJob.cancelRequestedAt),
    isNull(generationJob.providerDispatchedAt),
  )).returning({ id: generationJob.id });
  if (!updated) throw attemptOwnershipError('Generation attempt no longer owns the provider dispatch.');
}

export async function clearProviderCallDispatch(jobId: string, attemptCount: number) {
  const [updated] = await getDb().update(generationJob).set({
    providerDispatchedAt: null,
    providerDispatchedAttempt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(generationJob.id, jobId),
    eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, attemptCount),
    eq(generationJob.providerDispatchedAttempt, attemptCount),
    isNull(generationJob.cancelRequestedAt),
  )).returning({ id: generationJob.id });
  if (!updated) throw attemptOwnershipError('Generation attempt no longer owns the provider dispatch.');
}

export async function assertActiveGenerationAttempt(
  jobId: string,
  attemptCount: number,
  signal: AbortSignal,
) {
  if (signal.aborted) throw attemptOwnershipError('Generation attempt was canceled or lost its lease.');
  const [record] = await getDb().select({ id: generationJob.id }).from(generationJob)
    .where(and(
      eq(generationJob.id, jobId),
      eq(generationJob.status, 'running'),
      eq(generationJob.attemptCount, attemptCount),
      isNull(generationJob.cancelRequestedAt),
    ))
    .limit(1);
  if (!record) throw attemptOwnershipError('Generation attempt was canceled or lost its lease.');
}

function attemptOwnershipError(message = 'Generation attempt no longer owns the job.') {
  return executionError('generation_attempt_canceled', message, false);
}

function executionError(code: string, message: string, retryable: boolean) {
  return new GenerationExecutionError({ code, message, retryable });
}
