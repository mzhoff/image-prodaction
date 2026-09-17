import { and, asc, eq, gt, inArray, isNotNull, isNull, notExists, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type ProviderAdapter } from '@/modules/provider-connections';
import { resolveOpenRouterCredentialForWorkspace } from '@/modules/provider-connections/server/provider-connection-service';
import { createRuntimeOpenRouterAdapter } from '@/modules/provider-connections/server/runtime-provider-adapter';
import { recordUsageEvent } from '@/modules/usage';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { usageEvent } from '@/shared/db/schema/usage';
import { normalizeProviderCostUsd } from '@/shared/lib/provider-cost-decimal';
import { createOpenRouterVideoAdapter } from '@/modules/provider-connections/adapters/openrouter-video-adapter';
import type { VideoProviderAdapter } from '@/modules/provider-connections/contracts/video-provider';

interface UsageReconciliationCandidate {
  operation?: string;
  videoOperationId?: string | null;
  attemptCount: number;
  id: string;
  providerDispatchedAttempt: number | null;
  providerOperationId: string;
  workspaceId: string;
  usageRevision?: number;
  succeeded?: boolean;
  inputTokens?: string | null;
  outputTokens?: string | null;
  totalTokens?: string | null;
  providerCostUsd?: string | null;
}

export interface ProviderUsageReconcilerDependencies {
  videoAdapter?: VideoProviderAdapter;
  adapter: ProviderAdapter;
  loadCandidates(limit: number): Promise<UsageReconciliationCandidate[]>;
  reconcileCandidate(
    candidate: UsageReconciliationCandidate,
    usage: Awaited<ReturnType<ProviderAdapter['getOperationStatus']>>['usage'],
  ): Promise<void>;
  resolveCredential(workspaceId: string): Promise<string>;
}

export async function reconcileOpenRouterUsageBatch(
  limit = 25,
  dependencies: ProviderUsageReconcilerDependencies = createDependencies(),
) {
  const candidates = await dependencies.loadCandidates(Math.max(1, Math.min(limit, 100)));
  let reconciled = 0;
  let pending = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const credential = await dependencies.resolveCredential(candidate.workspaceId);
      const status = candidate.operation === 'generate_video' && candidate.videoOperationId
        ? await (dependencies.videoAdapter ?? createOpenRouterVideoAdapter()).poll(candidate.videoOperationId, { credential, signal: AbortSignal.timeout(60_000) })
        : await dependencies.adapter.getOperationStatus(
        candidate.providerOperationId,
        { credential },
      );
      if ((!status.usage.complete && status.usage.providerCostUsd === null)
        || !hasImprovedUsage(candidate, status.usage)) {
        pending += 1;
        continue;
      }
      await dependencies.reconcileCandidate(candidate, status.usage);
      reconciled += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: candidates.length, reconciled, pending, failed };
}

function createDependencies(): ProviderUsageReconcilerDependencies {
  return {
    adapter: createRuntimeOpenRouterAdapter(),
    loadCandidates,
    reconcileCandidate,
    resolveCredential: async (workspaceId) => (
      await resolveOpenRouterCredentialForWorkspace(workspaceId)
    ).apiKey,
  };
}

async function loadCandidates(limit: number): Promise<UsageReconciliationCandidate[]> {
  const newer = alias(usageEvent, 'newer_usage_revision');
  const rows = await getDb().select({
    operation: generationJob.operation,
    videoOperationId: generationJob.providerOperationId,
    attemptCount: usageEvent.attemptCount,
    id: generationJob.id,
    providerOperationId: usageEvent.providerOperationId,
    workspaceId: generationJob.workspaceId,
    usageRevision: usageEvent.callIndex,
    succeeded: usageEvent.succeeded,
    inputTokens: usageEvent.inputTokens,
    outputTokens: usageEvent.outputTokens,
    totalTokens: usageEvent.totalTokens,
    providerCostUsd: usageEvent.providerCostUsd,
  }).from(usageEvent).innerJoin(generationJob, eq(generationJob.id, usageEvent.generationJobId)).where(and(
    eq(generationJob.provider, 'openrouter'),
    or(eq(usageEvent.usageComplete, false), isNull(usageEvent.providerCostUsd)),
    isNotNull(usageEvent.providerOperationId),
    inArray(generationJob.status, ['succeeded', 'failed', 'canceled']),
    gt(generationJob.finishedAt, new Date(Date.now() - 24 * 60 * 60 * 1_000)),
    notExists(getDb().select({ id: newer.id }).from(newer).where(and(
      eq(newer.generationJobId, usageEvent.generationJobId),
      eq(newer.attemptCount, usageEvent.attemptCount), gt(newer.callIndex, usageEvent.callIndex),
    ))),
  )).orderBy(asc(usageEvent.occurredAt)).limit(limit);
  const candidates: UsageReconciliationCandidate[] = rows.flatMap((row) => row.providerOperationId
    ? [{ ...row, providerDispatchedAttempt: row.attemptCount, providerOperationId: row.providerOperationId }]
    : []);
  if (candidates.length < limit) {
    const missingEvents = await getDb().select({
      operation: generationJob.operation, videoOperationId: generationJob.providerOperationId,
      id: generationJob.id, attemptCount: generationJob.attemptCount,
      providerDispatchedAttempt: generationJob.providerDispatchedAttempt,
      providerOperationId: generationJob.providerOperationId, workspaceId: generationJob.workspaceId,
    }).from(generationJob).where(and(
      eq(generationJob.provider, 'openrouter'), isNotNull(generationJob.providerOperationId),
      inArray(generationJob.status, ['succeeded', 'failed', 'canceled']),
      gt(generationJob.finishedAt, new Date(Date.now() - 24 * 60 * 60 * 1_000)),
      notExists(getDb().select({ id: usageEvent.id }).from(usageEvent)
        .where(eq(usageEvent.generationJobId, generationJob.id))),
    )).orderBy(asc(generationJob.updatedAt)).limit(limit - candidates.length);
    candidates.push(...missingEvents.flatMap((row) => row.providerOperationId
      ? [{ ...row, providerOperationId: row.providerOperationId }] : []));
  }
  return candidates;
}

async function reconcileCandidate(
  candidate: UsageReconciliationCandidate,
  usage: Awaited<ReturnType<ProviderAdapter['getOperationStatus']>>['usage'],
) {
  const attemptCount = candidate.providerDispatchedAttempt ?? candidate.attemptCount;
  await recordUsageEvent({
    attemptCount,
    callIndex: (candidate.usageRevision ?? 0) + 1,
    generationJobId: candidate.id,
    inputTokens: usage.inputTokens ?? nullableToken(candidate.inputTokens),
    outputTokens: usage.outputTokens ?? nullableToken(candidate.outputTokens),
    providerCostUsd: normalizeProviderCostUsd(usage.providerCostUsd) ?? candidate.providerCostUsd,
    providerOperationId: candidate.providerOperationId,
    succeeded: candidate.succeeded ?? true,
    totalTokens: usage.totalTokens ?? nullableToken(candidate.totalTokens),
    metadata: {
      reconciliation: true,
    },
  });
}

function nullableToken(value: string | null | undefined) {
  return value == null ? null : Number(value);
}

function hasImprovedUsage(
  candidate: UsageReconciliationCandidate,
  usage: Awaited<ReturnType<ProviderAdapter['getOperationStatus']>>['usage'],
) {
  return (candidate.providerCostUsd == null && normalizeProviderCostUsd(usage.providerCostUsd) !== null)
    || (candidate.inputTokens == null && usage.inputTokens !== null)
    || (candidate.outputTokens == null && usage.outputTokens !== null)
    || (candidate.totalTokens == null && usage.totalTokens !== null);
}
