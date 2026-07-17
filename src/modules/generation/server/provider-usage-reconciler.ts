import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { type ProviderAdapter } from '@/modules/provider-connections';
import { resolveOpenRouterCredentialForWorkspace } from '@/modules/provider-connections/server/provider-connection-service';
import { createRuntimeOpenRouterAdapter } from '@/modules/provider-connections/server/runtime-provider-adapter';
import { recordUsageEvent } from '@/modules/usage';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';

interface UsageReconciliationCandidate {
  attemptCount: number;
  id: string;
  providerDispatchedAttempt: number | null;
  providerOperationId: string;
  workspaceId: string;
}

export interface ProviderUsageReconcilerDependencies {
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
      const status = await dependencies.adapter.getOperationStatus(
        candidate.providerOperationId,
        { credential },
      );
      if (!status.usage.complete) {
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
  const rows = await getDb().select({
    attemptCount: generationJob.attemptCount,
    id: generationJob.id,
    providerDispatchedAttempt: generationJob.providerDispatchedAttempt,
    providerOperationId: generationJob.providerOperationId,
    workspaceId: generationJob.workspaceId,
  }).from(generationJob).where(and(
    eq(generationJob.provider, 'openrouter'),
    eq(generationJob.usageComplete, false),
    isNotNull(generationJob.providerOperationId),
    inArray(generationJob.status, ['succeeded', 'failed', 'canceled']),
  )).orderBy(asc(generationJob.updatedAt)).limit(limit);
  return rows.flatMap((row) => row.providerOperationId
    ? [{ ...row, providerOperationId: row.providerOperationId }]
    : []);
}

async function reconcileCandidate(
  candidate: UsageReconciliationCandidate,
  usage: Awaited<ReturnType<ProviderAdapter['getOperationStatus']>>['usage'],
) {
  const attemptCount = candidate.providerDispatchedAttempt ?? candidate.attemptCount;
  await recordUsageEvent({
    attemptCount,
    callIndex: 1,
    generationJobId: candidate.id,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    providerCostUsd: usage.providerCostUsd,
    providerOperationId: candidate.providerOperationId,
    succeeded: true,
    totalTokens: usage.totalTokens,
    metadata: {
      reconciliation: true,
    },
  });
}
