import { and, asc, eq, gte, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';

export async function claimNextGenerationJob(input: { claimedAt: Date; leaseExpiresAt: Date }) {
  return getDb().transaction(async (transaction) => {
    await closeCanceledAndExhaustedJobs(transaction, input.claimedAt);
    const [candidate] = await transaction.select().from(generationJob)
      .where(and(
        lt(generationJob.attemptCount, generationJob.maxAttempts),
        isNotNull(generationJob.enqueuedAt),
        isNull(generationJob.cancelRequestedAt),
        or(
          eq(generationJob.status, 'queued'),
          and(
            eq(generationJob.status, 'failed'),
            eq(generationJob.retryable, true),
            or(isNull(generationJob.retryAvailableAt), lte(generationJob.retryAvailableAt, input.claimedAt)),
          ),
          and(
            eq(generationJob.status, 'running'),
            or(isNull(generationJob.leaseExpiresAt), lte(generationJob.leaseExpiresAt, input.claimedAt)),
          ),
        ),
      ))
      .orderBy(
        asc(sql`case ${generationJob.status} when 'queued' then 0 when 'failed' then 1 else 2 end`),
        asc(sql`coalesce(
          ${generationJob.retryAvailableAt}, ${generationJob.leaseExpiresAt},
          ${generationJob.enqueuedAt}, ${generationJob.createdAt}
        )`),
        asc(generationJob.createdAt),
        asc(generationJob.id),
      )
      .for('update', { skipLocked: true })
      .limit(1);
    if (!candidate) return undefined;
    const [claimed] = await transaction.update(generationJob).set({
      status: 'running',
      attemptCount: sql`${generationJob.attemptCount} + 1`,
      retryable: null,
      errorCode: null,
      errorMessage: null,
      finishedAt: null,
      startedAt: sql`coalesce(${generationJob.startedAt}, ${input.claimedAt})`,
      leaseExpiresAt: input.leaseExpiresAt,
      retryAvailableAt: null,
      updatedAt: input.claimedAt,
    }).where(and(
      eq(generationJob.id, candidate.id),
      eq(generationJob.attemptCount, candidate.attemptCount),
    )).returning();
    return claimed;
  });
}

async function closeCanceledAndExhaustedJobs(
  transaction: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  claimedAt: Date,
) {
  await transaction.update(generationJob).set({
    status: 'canceled',
    retryable: false,
    errorCode: 'generation_canceled',
    errorMessage: 'Generation was canceled by the user.',
    leaseExpiresAt: null,
    retryAvailableAt: null,
    finishedAt: claimedAt,
    updatedAt: claimedAt,
  }).where(and(
    eq(generationJob.status, 'running'),
    isNotNull(generationJob.cancelRequestedAt),
    or(isNull(generationJob.leaseExpiresAt), lte(generationJob.leaseExpiresAt, claimedAt)),
  ));
  await transaction.update(generationJob).set({
    status: 'failed',
    retryable: false,
    errorCode: sql`case when ${generationJob.providerDispatchedAt} is not null
      then 'provider_outcome_unknown' else 'max_attempts_exhausted' end`,
    errorMessage: sql`case when ${generationJob.providerDispatchedAt} is not null
      then 'The provider call was dispatched before the worker lease expired. Automatic retry is blocked to prevent duplicate charges.'
      else 'Generation worker lease expired after the final allowed attempt.' end`,
    leaseExpiresAt: null,
    retryAvailableAt: null,
    finishedAt: claimedAt,
    updatedAt: claimedAt,
  }).where(and(
    eq(generationJob.status, 'running'),
    isNotNull(generationJob.enqueuedAt),
    isNull(generationJob.cancelRequestedAt),
    gte(generationJob.attemptCount, generationJob.maxAttempts),
    or(isNull(generationJob.leaseExpiresAt), lte(generationJob.leaseExpiresAt, claimedAt)),
  ));
}
