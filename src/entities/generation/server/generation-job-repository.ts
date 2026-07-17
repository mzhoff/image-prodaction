import {
  and,
  asc,
  eq,
  gte,
  gt,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { generationJob } from '@/shared/db/schema/generation';
import { membership } from '@/shared/db/schema/workspace';

export type GenerationJobRecord = typeof generationJob.$inferSelect;

export interface NewGenerationJobRecord {
  createdByUserId: string;
  documentId: string | null;
  id: string;
  idempotencyKey: string;
  maxAttempts: number;
  metadata: Record<string, unknown> | null;
  modelId: string;
  operation: string;
  provider: string;
  workspaceId: string;
}

export interface GenerationUsageRecord {
  inputTokens: string | null;
  internalCreditsBalanceAfter: string | null;
  internalCreditsCharged: string | null;
  outputTokens: string | null;
  providerCostUsd: string | null;
  totalTokens: string | null;
}

export interface GenerationJobRepository {
  claimNext(input: {
    claimedAt: Date;
    leaseExpiresAt: Date;
  }): Promise<GenerationJobRecord | undefined>;
  createOrFind(input: NewGenerationJobRecord): Promise<{
    created: boolean;
    record: GenerationJobRecord;
  }>;
  fail(input: {
    attemptCount: number;
    errorCode: string;
    errorMessage: string;
    finishedAt: Date;
    id: string;
    retryAvailableAt?: Date | null;
    retryable: boolean;
    usage: GenerationUsageRecord;
  }): Promise<GenerationJobRecord | undefined>;
  expireLease(id: string, expiredAt: Date): Promise<GenerationJobRecord | undefined>;
  findAccessible(id: string, userId: string): Promise<GenerationJobRecord | undefined>;
  findById(id: string): Promise<GenerationJobRecord | undefined>;
  heartbeat(input: {
    attemptCount: number;
    heartbeatAt: Date;
    id: string;
    leaseExpiresAt: Date;
  }): Promise<GenerationJobRecord | undefined>;
  start(id: string, startedAt: Date, leaseExpiresAt: Date): Promise<GenerationJobRecord | undefined>;
  succeed(input: {
    attemptCount: number;
    finalAssetId: string | null;
    finishedAt: Date;
    id: string;
    usageComplete: boolean;
    usage: GenerationUsageRecord;
  }): Promise<GenerationJobRecord | undefined>;
}

export function createDbGenerationJobRepository(): GenerationJobRepository {
  return {
    async claimNext(input) {
      return getDb().transaction(async (transaction) => {
        await transaction.update(generationJob).set({
          status: 'canceled',
          retryable: false,
          errorCode: 'generation_canceled',
          errorMessage: 'Generation was canceled by the user.',
          leaseExpiresAt: null,
          retryAvailableAt: null,
          finishedAt: input.claimedAt,
          updatedAt: input.claimedAt,
        }).where(and(
          eq(generationJob.status, 'running'),
          isNotNull(generationJob.cancelRequestedAt),
          or(
            isNull(generationJob.leaseExpiresAt),
            lte(generationJob.leaseExpiresAt, input.claimedAt),
          ),
        ));

        await transaction.update(generationJob).set({
          status: 'failed',
          retryable: false,
          errorCode: sql`case
            when ${generationJob.providerDispatchedAt} is not null
              then 'provider_outcome_unknown'
            else 'max_attempts_exhausted'
          end`,
          errorMessage: sql`case
            when ${generationJob.providerDispatchedAt} is not null
              then 'The provider call was dispatched before the worker lease expired. Automatic retry is blocked to prevent duplicate charges.'
            else 'Generation worker lease expired after the final allowed attempt.'
          end`,
          leaseExpiresAt: null,
          retryAvailableAt: null,
          finishedAt: input.claimedAt,
          updatedAt: input.claimedAt,
        }).where(and(
          eq(generationJob.status, 'running'),
          isNotNull(generationJob.enqueuedAt),
          isNull(generationJob.cancelRequestedAt),
          gte(generationJob.attemptCount, generationJob.maxAttempts),
          or(
            isNull(generationJob.leaseExpiresAt),
            lte(generationJob.leaseExpiresAt, input.claimedAt),
          ),
        ));

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
                or(
                  isNull(generationJob.retryAvailableAt),
                  lte(generationJob.retryAvailableAt, input.claimedAt),
                ),
              ),
              and(
                eq(generationJob.status, 'running'),
                or(
                  isNull(generationJob.leaseExpiresAt),
                  lte(generationJob.leaseExpiresAt, input.claimedAt),
                ),
              ),
            ),
          ))
          .orderBy(
            asc(sql`case ${generationJob.status}
              when 'queued' then 0
              when 'failed' then 1
              else 2
            end`),
            asc(sql`coalesce(
              ${generationJob.retryAvailableAt},
              ${generationJob.leaseExpiresAt},
              ${generationJob.enqueuedAt},
              ${generationJob.createdAt}
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
    },

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

    async succeed(input) {
      return getDb().transaction(async (transaction) => {
        const [updated] = await transaction.update(generationJob).set({
          status: sql`case
            when ${generationJob.cancelRequestedAt} is not null
              then 'canceled'::generation_job_status
            else 'succeeded'::generation_job_status
          end`,
          retryable: false,
          errorCode: sql`case
            when ${generationJob.cancelRequestedAt} is not null
              then 'generation_canceled'
            else null
          end`,
          errorMessage: sql`case
            when ${generationJob.cancelRequestedAt} is not null
              then 'Generation was canceled by the user.'
            else null
          end`,
          finalAssetId: sql`case
            when ${generationJob.cancelRequestedAt} is not null
              then null
            else ${input.finalAssetId}::uuid
          end`,
          internalCreditsBalanceAfter: input.usage.internalCreditsBalanceAfter === null
            ? generationJob.internalCreditsBalanceAfter
            : input.usage.internalCreditsBalanceAfter,
          leaseExpiresAt: null,
          retryAvailableAt: null,
          finishedAt: input.finishedAt,
          updatedAt: input.finishedAt,
        }).where(and(
          eq(generationJob.id, input.id),
          eq(generationJob.status, 'running'),
          eq(generationJob.attemptCount, input.attemptCount),
        )).returning();
        if (!updated) return undefined;
        if (input.finalAssetId && updated.status === 'succeeded') {
          const [published] = await transaction.update(asset).set({
            libraryVisible: true,
            updatedAt: input.finishedAt,
          }).where(and(
            eq(asset.id, input.finalAssetId),
            eq(asset.generationJobId, input.id),
            eq(asset.workspaceId, updated.workspaceId),
            eq(asset.origin, 'generated'),
            eq(asset.status, 'ready'),
            eq(asset.libraryVisible, false),
          )).returning({ id: asset.id });
          const [alreadyPublished] = published ? [] : await transaction.select({
            id: asset.id,
          }).from(asset).where(and(
            eq(asset.id, input.finalAssetId),
            eq(asset.generationJobId, input.id),
            eq(asset.workspaceId, updated.workspaceId),
            eq(asset.origin, 'generated'),
            eq(asset.status, 'ready'),
            eq(asset.libraryVisible, true),
          )).limit(1);
          if (!published && !alreadyPublished) {
            throw new Error('Generated asset could not be atomically published with its job.');
          }
        }
        return updated;
      });
    },
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
