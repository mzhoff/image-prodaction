import {
  and,
  eq,
  gt,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { membership } from '@/shared/db/schema/workspace';
import { claimNextGenerationJob } from './generation-job-queue-repository';
import { succeedGenerationJobRecord } from './generation-job-success-repository';
import type { GenerationJobRepository } from './generation-job-repository-contracts';

export type {
  GenerationJobRecord,
  GenerationJobRepository,
  GenerationUsageRecord,
  NewGenerationJobRecord,
} from './generation-job-repository-contracts';

export function createDbGenerationJobRepository(): GenerationJobRepository {
  return {
    claimNext: claimNextGenerationJob,

    async createOrFind(input) {
      const [created] = await getDb().insert(generationJob).values(input)
        .onConflictDoNothing({
          target: [generationJob.workspaceId, generationJob.idempotencyKey],
        })
        .returning();
      if (created) return { created: true, record: created };

      const [existing] = await getDb().select().from(generationJob).where(and(
        eq(generationJob.workspaceId, input.workspaceId),
        eq(generationJob.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (!existing) throw new Error('Generation job could not be created or found.');
      return { created: false, record: existing };
    },

    async fail(input) {
      const [updated] = await getDb().update(generationJob).set({
        status: sql`case
          when ${generationJob.cancelRequestedAt} is not null
            then 'canceled'::generation_job_status
          else 'failed'::generation_job_status
        end`,
        retryable: sql`case
          when ${generationJob.cancelRequestedAt} is not null then false
          else ${input.retryable}
        end`,
        errorCode: sql`case
          when ${generationJob.cancelRequestedAt} is not null then 'generation_canceled'
          else ${input.errorCode}
        end`,
        errorMessage: sql`case
          when ${generationJob.cancelRequestedAt} is not null
            then 'Generation was canceled by the user.'
          else ${input.errorMessage}
        end`,
        internalCreditsBalanceAfter: input.usage.internalCreditsBalanceAfter === null
          ? generationJob.internalCreditsBalanceAfter
          : input.usage.internalCreditsBalanceAfter,
        leaseExpiresAt: null,
        retryAvailableAt: input.retryable ? input.retryAvailableAt ?? null : null,
        finishedAt: input.finishedAt,
        updatedAt: input.finishedAt,
      }).where(and(
        eq(generationJob.id, input.id),
        eq(generationJob.status, 'running'),
        eq(generationJob.attemptCount, input.attemptCount),
      )).returning();
      return updated;
    },

    async expireLease(id, expiredAt) {
      const [updated] = await getDb().update(generationJob).set({
        status: 'failed',
        retryable: sql`${generationJob.providerDispatchedAt} is null
          AND ${generationJob.attemptCount} < ${generationJob.maxAttempts}`,
        errorCode: sql`case
          when ${generationJob.providerDispatchedAt} is not null
            then 'provider_outcome_unknown'
          when ${generationJob.attemptCount} < ${generationJob.maxAttempts}
            then 'lease_expired'
          else 'max_attempts_exhausted'
        end`,
        errorMessage: sql`case
          when ${generationJob.providerDispatchedAt} is not null
            then 'The provider call was dispatched before the worker lease expired. Automatic retry is blocked to prevent duplicate charges.'
          when ${generationJob.attemptCount} < ${generationJob.maxAttempts}
            then 'Generation worker lease expired before completion.'
          else 'Generation worker lease expired after the final allowed attempt.'
        end`,
        leaseExpiresAt: null,
        retryAvailableAt: sql<Date | null>`case
          when ${generationJob.providerDispatchedAt} is null
            AND ${generationJob.attemptCount} < ${generationJob.maxAttempts}
            then ${expiredAt}::timestamptz
          else null::timestamptz
        end`,
        finishedAt: expiredAt,
        updatedAt: expiredAt,
      }).where(and(
        eq(generationJob.id, id),
        eq(generationJob.status, 'running'),
        isNull(generationJob.cancelRequestedAt),
        or(
          isNull(generationJob.leaseExpiresAt),
          lte(generationJob.leaseExpiresAt, expiredAt),
        ),
      )).returning();
      return updated;
    },

    async findAccessible(id, userId) {
      const [record] = await getDb().select(generationJobSelect).from(generationJob)
        .innerJoin(membership, and(
          eq(membership.workspaceId, generationJob.workspaceId),
          eq(membership.userId, userId),
        ))
        .where(eq(generationJob.id, id))
        .limit(1);
      return record;
    },

    async findById(id) {
      const [record] = await getDb().select().from(generationJob)
        .where(eq(generationJob.id, id))
        .limit(1);
      return record;
    },

    async heartbeat(input) {
      const [updated] = await getDb().update(generationJob).set({
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.heartbeatAt,
      }).where(and(
        eq(generationJob.id, input.id),
        eq(generationJob.status, 'running'),
        eq(generationJob.attemptCount, input.attemptCount),
        gt(generationJob.leaseExpiresAt, input.heartbeatAt),
      )).returning();
      return updated;
    },

    async start(id, startedAt, leaseExpiresAt) {
      const [updated] = await getDb().update(generationJob).set({
        status: 'running',
        attemptCount: sql`${generationJob.attemptCount} + 1`,
        retryable: null,
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
        startedAt: sql`coalesce(${generationJob.startedAt}, ${startedAt})`,
        leaseExpiresAt,
        retryAvailableAt: null,
        updatedAt: startedAt,
      }).where(and(
        eq(generationJob.id, id),
        lt(generationJob.attemptCount, generationJob.maxAttempts),
        isNull(generationJob.cancelRequestedAt),
        or(
          eq(generationJob.status, 'queued'),
          and(
            eq(generationJob.status, 'failed'),
            eq(generationJob.retryable, true),
            or(
              isNull(generationJob.retryAvailableAt),
              lte(generationJob.retryAvailableAt, startedAt),
            ),
          ),
        ),
      )).returning();
      return updated;
    },

    succeed: succeedGenerationJobRecord,
  };
}

const generationJobSelect = {
  id: generationJob.id,
  workspaceId: generationJob.workspaceId,
  documentId: generationJob.documentId,
  createdByUserId: generationJob.createdByUserId,
  provider: generationJob.provider,
  modelId: generationJob.modelId,
  operation: generationJob.operation,
  idempotencyKey: generationJob.idempotencyKey,
  requestObjectKey: generationJob.requestObjectKey,
  resultObjectKey: generationJob.resultObjectKey,
  providerOperationId: generationJob.providerOperationId,
  providerDispatchedAt: generationJob.providerDispatchedAt,
  providerDispatchedAttempt: generationJob.providerDispatchedAttempt,
  queueJobId: generationJob.queueJobId,
  status: generationJob.status,
  attemptCount: generationJob.attemptCount,
  maxAttempts: generationJob.maxAttempts,
  inputTokens: generationJob.inputTokens,
  outputTokens: generationJob.outputTokens,
  totalTokens: generationJob.totalTokens,
  providerCostUsd: generationJob.providerCostUsd,
  internalCreditsCharged: generationJob.internalCreditsCharged,
  internalCreditsBalanceAfter: generationJob.internalCreditsBalanceAfter,
  usageComplete: generationJob.usageComplete,
  finalAssetId: generationJob.finalAssetId,
  retryable: generationJob.retryable,
  errorCode: generationJob.errorCode,
  errorMessage: generationJob.errorMessage,
  metadata: generationJob.metadata,
  createdAt: generationJob.createdAt,
  enqueuedAt: generationJob.enqueuedAt,
  startedAt: generationJob.startedAt,
  leaseExpiresAt: generationJob.leaseExpiresAt,
  retryAvailableAt: generationJob.retryAvailableAt,
  cancelRequestedAt: generationJob.cancelRequestedAt,
  finishedAt: generationJob.finishedAt,
  updatedAt: generationJob.updatedAt,
};
