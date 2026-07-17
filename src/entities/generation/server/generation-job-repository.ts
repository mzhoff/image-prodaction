import {
  and,
  eq,
  isNull,
  lt,
  or,
  sql,
  type AnyColumn,
} from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
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
    retryable: boolean;
    usage: GenerationUsageRecord;
  }): Promise<GenerationJobRecord | undefined>;
  expireLease(id: string, expiredAt: Date): Promise<GenerationJobRecord | undefined>;
  findAccessible(id: string, userId: string): Promise<GenerationJobRecord | undefined>;
  findById(id: string): Promise<GenerationJobRecord | undefined>;
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
        status: 'failed',
        retryable: input.retryable,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        inputTokens: addLedgerValue(generationJob.inputTokens, input.usage.inputTokens),
        outputTokens: addLedgerValue(generationJob.outputTokens, input.usage.outputTokens),
        totalTokens: addLedgerValue(generationJob.totalTokens, input.usage.totalTokens),
        providerCostUsd: addLedgerValue(generationJob.providerCostUsd, input.usage.providerCostUsd),
        internalCreditsCharged: addLedgerValue(
          generationJob.internalCreditsCharged,
          input.usage.internalCreditsCharged,
        ),
        internalCreditsBalanceAfter: input.usage.internalCreditsBalanceAfter === null
          ? generationJob.internalCreditsBalanceAfter
          : input.usage.internalCreditsBalanceAfter,
        usageComplete: sql`${generationJob.usageComplete} OR ${hasCompleteUsage(input.usage)}`,
        leaseExpiresAt: null,
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
        retryable: true,
        errorCode: 'lease_expired',
        errorMessage: 'Generation worker lease expired before completion.',
        leaseExpiresAt: null,
        finishedAt: expiredAt,
        updatedAt: expiredAt,
      }).where(and(
        eq(generationJob.id, id),
        eq(generationJob.status, 'running'),
        or(
          isNull(generationJob.leaseExpiresAt),
          lt(generationJob.leaseExpiresAt, expiredAt),
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
        updatedAt: startedAt,
      }).where(and(
        eq(generationJob.id, id),
        lt(generationJob.attemptCount, generationJob.maxAttempts),
        or(
          eq(generationJob.status, 'queued'),
          and(eq(generationJob.status, 'failed'), eq(generationJob.retryable, true)),
        ),
      )).returning();
      return updated;
    },

    async succeed(input) {
      const [updated] = await getDb().update(generationJob).set({
        status: 'succeeded',
        retryable: false,
        errorCode: null,
        errorMessage: null,
        finalAssetId: input.finalAssetId,
        inputTokens: addLedgerValue(generationJob.inputTokens, input.usage.inputTokens),
        outputTokens: addLedgerValue(generationJob.outputTokens, input.usage.outputTokens),
        totalTokens: addLedgerValue(generationJob.totalTokens, input.usage.totalTokens),
        providerCostUsd: addLedgerValue(generationJob.providerCostUsd, input.usage.providerCostUsd),
        internalCreditsCharged: addLedgerValue(
          generationJob.internalCreditsCharged,
          input.usage.internalCreditsCharged,
        ),
        internalCreditsBalanceAfter: input.usage.internalCreditsBalanceAfter === null
          ? generationJob.internalCreditsBalanceAfter
          : input.usage.internalCreditsBalanceAfter,
        usageComplete: sql`${generationJob.usageComplete} OR ${input.usageComplete}`,
        leaseExpiresAt: null,
        finishedAt: input.finishedAt,
        updatedAt: input.finishedAt,
      }).where(and(
        eq(generationJob.id, input.id),
        eq(generationJob.status, 'running'),
        eq(generationJob.attemptCount, input.attemptCount),
      )).returning();
      return updated;
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
  startedAt: generationJob.startedAt,
  leaseExpiresAt: generationJob.leaseExpiresAt,
  finishedAt: generationJob.finishedAt,
  updatedAt: generationJob.updatedAt,
};

function addLedgerValue(
  column: AnyColumn,
  value: string | null,
) {
  return value === null
    ? sql`${column}`
    : sql`coalesce(${column}, 0) + ${value}::numeric`;
}

function hasCompleteUsage(usage: GenerationUsageRecord) {
  return usage.inputTokens !== null
    && usage.outputTokens !== null
    && usage.totalTokens !== null;
}
