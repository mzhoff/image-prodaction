import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  lte,
} from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { usageEvent } from '@/shared/db/schema/usage';

interface ExpiredShortAiJob {
  attemptCount: number;
  id: string;
  providerDispatchedAt: Date | null;
  resultObjectKey: string | null;
}

export interface ShortAiRecoveryDependencies {
  loadCandidates(input: {
    expiredAt: Date;
    limit: number;
  }): Promise<ExpiredShortAiJob[]>;
  recoverCandidate(candidate: ExpiredShortAiJob, recoveredAt: Date): Promise<boolean>;
}

/**
 * Closes synchronous AI jobs whose HTTP process disappeared after taking a
 * durable lease. A saved result is promoted to succeeded and can be replayed;
 * an uncheckpointed dispatched call becomes outcome-unknown and is never
 * automatically sent to the provider again.
 */
export async function recoverExpiredShortAiJobs(
  input: { limit?: number; now?: Date } = {},
  dependencies: ShortAiRecoveryDependencies = createDependencies(),
) {
  const recoveredAt = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const candidates = await dependencies.loadCandidates({
    expiredAt: recoveredAt,
    limit,
  });
  let succeeded = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const recovered = await dependencies.recoverCandidate(candidate, recoveredAt);
    if (!recovered) continue;
    if (candidate.resultObjectKey) succeeded += 1;
    else failed += 1;
  }
  return {
    scanned: candidates.length,
    succeeded,
    failed,
  };
}

function createDependencies(): ShortAiRecoveryDependencies {
  return {
    loadCandidates,
    recoverCandidate,
  };
}

async function loadCandidates(input: {
  expiredAt: Date;
  limit: number;
}): Promise<ExpiredShortAiJob[]> {
  return getDb().select({
    attemptCount: generationJob.attemptCount,
    id: generationJob.id,
    providerDispatchedAt: generationJob.providerDispatchedAt,
    resultObjectKey: generationJob.resultObjectKey,
  }).from(generationJob).where(and(
    eq(generationJob.status, 'running'),
    isNull(generationJob.enqueuedAt),
    isNull(generationJob.cancelRequestedAt),
    isNotNull(generationJob.leaseExpiresAt),
    lte(generationJob.leaseExpiresAt, input.expiredAt),
  )).orderBy(asc(generationJob.leaseExpiresAt)).limit(input.limit);
}

async function recoverCandidate(
  candidate: ExpiredShortAiJob,
  recoveredAt: Date,
) {
  return getDb().transaction(async (transaction) => {
    const [usage] = candidate.resultObjectKey
      ? await transaction.select().from(usageEvent).where(and(
          eq(usageEvent.generationJobId, candidate.id),
          eq(usageEvent.attemptCount, candidate.attemptCount),
        )).orderBy(desc(usageEvent.callIndex), desc(usageEvent.occurredAt)).limit(1)
      : [];
    const [updated] = await transaction.update(generationJob).set(
      candidate.resultObjectKey
        ? {
            status: 'succeeded',
            retryable: false,
            errorCode: null,
            errorMessage: null,
            inputTokens: usage?.inputTokens ?? generationJob.inputTokens,
            outputTokens: usage?.outputTokens ?? generationJob.outputTokens,
            totalTokens: usage?.totalTokens ?? generationJob.totalTokens,
            providerCostUsd: usage?.providerCostUsd ?? generationJob.providerCostUsd,
            usageComplete: usage?.usageComplete ?? generationJob.usageComplete,
            leaseExpiresAt: null,
            retryAvailableAt: null,
            finishedAt: recoveredAt,
            updatedAt: recoveredAt,
          }
        : {
            status: 'failed',
            retryable: false,
            errorCode: candidate.providerDispatchedAt
              ? 'provider_outcome_unknown'
              : 'short_execution_expired',
            errorMessage: candidate.providerDispatchedAt
              ? 'The provider call was dispatched without a durable result. Automatic retry is blocked.'
              : 'The synchronous AI request expired before provider dispatch.',
            leaseExpiresAt: null,
            retryAvailableAt: null,
            finishedAt: recoveredAt,
            updatedAt: recoveredAt,
          },
    ).where(and(
      eq(generationJob.id, candidate.id),
      eq(generationJob.status, 'running'),
      eq(generationJob.attemptCount, candidate.attemptCount),
      isNull(generationJob.enqueuedAt),
      isNull(generationJob.cancelRequestedAt),
      lte(generationJob.leaseExpiresAt, recoveredAt),
      candidate.resultObjectKey
        ? eq(generationJob.resultObjectKey, candidate.resultObjectKey)
        : isNull(generationJob.resultObjectKey),
    )).returning({ id: generationJob.id });
    return Boolean(updated);
  });
}
