import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  notExists,
  sql,
  type AnyColumn,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { usageEvent } from '@/shared/db/schema/usage';
import { createUuidV7 } from '@/shared/lib/id';

export interface RecordUsageEventInput {
  attemptCount: number;
  callIndex?: number;
  errorCode?: string | null;
  generationJobId: string;
  inputTokens: number | null;
  metadata?: Record<string, unknown> | null;
  outputTokens: number | null;
  providerCostUsd?: string | null;
  providerOperationId?: string | null;
  succeeded: boolean;
  totalTokens: number | null;
}

export async function recordUsageEvent(input: RecordUsageEventInput) {
  return getDb().transaction(async (transaction) => {
    const [job] = await transaction.select().from(generationJob)
      .where(eq(generationJob.id, input.generationJobId))
      .limit(1);
    if (!job) throw new Error('Generation job does not exist for usage event.');

    const usageComplete = input.inputTokens !== null
      && input.outputTokens !== null
      && input.totalTokens !== null;
    const providerOperationId = normalizeOptionalText(input.providerOperationId, 255);
    const [event] = await transaction.insert(usageEvent).values({
      id: createUuidV7(),
      workspaceId: job.workspaceId,
      documentId: job.documentId,
      generationJobId: job.id,
      createdByUserId: job.createdByUserId,
      provider: job.provider,
      providerOperationId,
      modelId: job.modelId,
      operation: job.operation,
      attemptCount: normalizeNonNegativeInteger(input.attemptCount, 'Attempt count'),
      callIndex: normalizeNonNegativeInteger(input.callIndex ?? 0, 'Call index'),
      succeeded: input.succeeded,
      usageComplete,
      inputTokens: normalizeTokenCount(input.inputTokens),
      outputTokens: normalizeTokenCount(input.outputTokens),
      totalTokens: normalizeTokenCount(input.totalTokens),
      providerCostUsd: normalizeDecimal(input.providerCostUsd),
      internalCreditsCharged: null,
      internalCreditsBalanceAfter: null,
      errorCode: normalizeOptionalText(input.errorCode, 120),
      metadata: sanitizeMetadata(input.metadata),
    }).onConflictDoNothing({
      target: [
        usageEvent.generationJobId,
        usageEvent.attemptCount,
        usageEvent.callIndex,
      ],
    }).returning();
    if (providerOperationId) {
      await transaction.update(generationJob).set({
        providerOperationId: sql`coalesce(
          ${generationJob.providerOperationId},
          ${providerOperationId}
        )`,
        updatedAt: new Date(),
      }).where(eq(generationJob.id, job.id));
    }
    await refreshGenerationJobUsage(transaction, job.id);
    return event;
  });
}

export async function getWorkspaceUsage(
  userId: string,
  workspaceId: string,
  periodDays = 30,
) {
  await requireWorkspaceMembership(userId, workspaceId);
  const normalizedPeriodDays = Number.isSafeInteger(periodDays)
    ? Math.min(365, Math.max(1, periodDays))
    : 30;
  const since = new Date(Date.now() - normalizedPeriodDays * 24 * 60 * 60 * 1_000);
  const newerUsageEvent = alias(usageEvent, 'newer_usage_event');
  const filters = and(
    eq(usageEvent.workspaceId, workspaceId),
    gte(usageEvent.occurredAt, since),
    notExists(
      getDb().select({ id: newerUsageEvent.id }).from(newerUsageEvent).where(and(
        eq(newerUsageEvent.generationJobId, usageEvent.generationJobId),
        eq(newerUsageEvent.attemptCount, usageEvent.attemptCount),
        gt(newerUsageEvent.callIndex, usageEvent.callIndex),
      )),
    ),
  );

  const [summaryRows, byModel, byOperation] = await Promise.all([
    getDb().select({
      jobs: count(),
      inputTokens: sumNumeric(usageEvent.inputTokens),
      outputTokens: sumNumeric(usageEvent.outputTokens),
      totalTokens: sumNumeric(usageEvent.totalTokens),
      providerCostUsd: sumNumeric(usageEvent.providerCostUsd),
    }).from(usageEvent).where(filters),
    getDb().select({
      modelId: usageEvent.modelId,
      jobs: count(),
      totalTokens: sumNumeric(usageEvent.totalTokens),
      providerCostUsd: sumNumeric(usageEvent.providerCostUsd),
    }).from(usageEvent)
      .where(filters)
      .groupBy(usageEvent.modelId)
      .orderBy(desc(sumNumeric(usageEvent.providerCostUsd))),
    getDb().select({
      operation: usageEvent.operation,
      jobs: count(),
      totalTokens: sumNumeric(usageEvent.totalTokens),
      providerCostUsd: sumNumeric(usageEvent.providerCostUsd),
    }).from(usageEvent)
      .where(filters)
      .groupBy(usageEvent.operation)
      .orderBy(desc(sumNumeric(usageEvent.providerCostUsd))),
  ]);

  const summary = summaryRows[0] ?? {
    jobs: 0,
    inputTokens: '0',
    outputTokens: '0',
    totalTokens: '0',
    providerCostUsd: '0',
  };
  return {
    periodDays: normalizedPeriodDays,
    periodStart: since.toISOString(),
    summary: normalizeAggregate(summary),
    byModel: byModel.map(normalizeAggregate),
    byOperation: byOperation.map(normalizeAggregate),
  };
}

function sumNumeric(column: AnyColumn) {
  return sql<string>`coalesce(sum(${column}), 0)::text`;
}

async function refreshGenerationJobUsage(
  transaction: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  generationJobId: string,
) {
  const newerUsageEvent = alias(usageEvent, 'newer_job_usage_event');
  const [aggregate] = await transaction.select({
    inputTokens: sumNullable(usageEvent.inputTokens),
    outputTokens: sumNullable(usageEvent.outputTokens),
    totalTokens: sumNullable(usageEvent.totalTokens),
    providerCostUsd: sumNullable(usageEvent.providerCostUsd),
    usageComplete: sql<boolean>`coalesce(bool_and(${usageEvent.usageComplete}), false)`,
  }).from(usageEvent).where(and(
    eq(usageEvent.generationJobId, generationJobId),
    notExists(
      transaction.select({ id: newerUsageEvent.id }).from(newerUsageEvent).where(and(
        eq(newerUsageEvent.generationJobId, usageEvent.generationJobId),
        eq(newerUsageEvent.attemptCount, usageEvent.attemptCount),
        gt(newerUsageEvent.callIndex, usageEvent.callIndex),
      )),
    ),
  ));
  if (!aggregate) return;
  await transaction.update(generationJob).set({
    inputTokens: aggregate.inputTokens,
    outputTokens: aggregate.outputTokens,
    totalTokens: aggregate.totalTokens,
    providerCostUsd: aggregate.providerCostUsd,
    usageComplete: aggregate.usageComplete,
    updatedAt: new Date(),
  }).where(eq(generationJob.id, generationJobId));
}

function sumNullable(column: AnyColumn) {
  return sql<string | null>`sum(${column})::text`;
}

function normalizeAggregate<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    jobs: Number(row.jobs ?? 0),
    inputTokens: String(row.inputTokens ?? '0'),
    outputTokens: String(row.outputTokens ?? '0'),
    totalTokens: String(row.totalTokens ?? '0'),
    providerCostUsd: String(row.providerCostUsd ?? '0'),
  };
}

function normalizeNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function normalizeTokenCount(value: number | null) {
  if (value === null) return null;
  return String(normalizeNonNegativeInteger(value, 'Token count'));
}

function normalizeDecimal(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(normalized)) {
    throw new Error('Provider cost must be a non-negative decimal with at most 8 fractional digits.');
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function sanitizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  const json = JSON.stringify(value);
  if (json.length > 8_000) throw new Error('Usage event metadata is too large.');
  return JSON.parse(json) as Record<string, unknown>;
}
