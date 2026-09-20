import { authorizeMemberDispatch } from '@/modules/workspace-budgets/server/member-budget-service';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { createUuidV7 } from '@/shared/lib/id';
import { pipelineRun } from '../adapters/postgres/pipeline-schema';
import { runtimeCostReservation } from '../adapters/postgres/runtime-cost-schema';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import { checkRuntimeDispatchBudget, type RuntimeTrustedCallBound } from '../core/runtime-cost-policy';
import { sumUsd } from '../core/runtime-cost-decimal';

/** Production adapters currently pass no bound: OpenRouter cannot promise a per-call USD ceiling. */
export async function markRuntimeProviderDispatched(input: {
  jobId: string;
  attemptCount: number;
  trustedBound?: RuntimeTrustedCallBound | null;
}): Promise<boolean> {
  const [candidate] = await getDb().select({ runId: generationJob.pipelineRunId })
    .from(generationJob).where(eq(generationJob.id, input.jobId)).limit(1);
  if (!candidate?.runId) return false;
  return getDb().transaction(async (transaction) => {
    // A run-row lock serializes every sibling-node reservation and usage settlement.
    const [run] = await transaction.select().from(pipelineRun)
      .where(eq(pipelineRun.id, candidate.runId!)).for('update').limit(1);
    if (!run?.runtimeSnapshot || !run.runtimeServiceClientId) throw lostOwnership();
    const now = new Date();
    if (run.status !== 'running' || run.cancelRequestedAt || !run.leaseExpiresAt || run.leaseExpiresAt <= now) {
      throw lostOwnership();
    }
    const [job] = await transaction.select().from(generationJob)
      .where(and(
        eq(generationJob.id, input.jobId), eq(generationJob.workspaceId, run.workspaceId),
        eq(generationJob.pipelineRunId, run.id), eq(generationJob.serviceClientId, run.runtimeServiceClientId),
      ))
      .for('update').limit(1);
    if (!job || job.status !== 'running' || job.attemptCount !== input.attemptCount
      || job.cancelRequestedAt || job.providerDispatchedAt
      || job.grantId !== run.runtimeGrantId || !job.leaseExpiresAt || job.leaseExpiresAt <= now) throw lostOwnership();
    await authorizeMemberDispatch(transaction, job.workspaceId, job.createdByUserId);
    const reservations = await transaction.select().from(runtimeCostReservation)
      .where(eq(runtimeCostReservation.pipelineRunId, run.id));
    if (reservations.some((entry) => entry.generationJobId === job.id && entry.attemptCount === input.attemptCount)) {
      throw lostOwnership();
    }
    const spent = reservations.filter((entry) => entry.actualCostUsd !== null);
    const outstanding = reservations.filter((entry) => entry.actualCostUsd === null);
    const checked = checkRuntimeDispatchBudget({
      cost: run.runtimeSnapshot.cost,
      spentUsd: sumUsd(spent.map((entry) => entry.actualCostUsd!)),
      reservedUsd: sumUsd(outstanding.flatMap((entry) => entry.reservedCostUsd === null ? [] : [entry.reservedCostUsd])),
      unresolvedCalls: outstanding.filter((entry) => entry.reservedCostUsd === null).length,
      bound: input.trustedBound ?? null,
    });
    const [updated] = await transaction.update(generationJob).set({
      providerDispatchedAt: now,
      providerDispatchedAttempt: input.attemptCount,
      updatedAt: now,
    }).where(and(
      eq(generationJob.id, job.id), eq(generationJob.attemptCount, input.attemptCount),
      isNull(generationJob.providerDispatchedAt), isNull(generationJob.cancelRequestedAt),
      gt(generationJob.leaseExpiresAt, now),
    )).returning({ id: generationJob.id });
    if (!updated) throw lostOwnership();
    await transaction.insert(runtimeCostReservation).values({
      id: createUuidV7(), pipelineRunId: run.id, generationJobId: job.id,
      attemptCount: input.attemptCount, reservedCostUsd: checked.reservedUsd,
      actualCostUsd: null, pricingSnapshotId: input.trustedBound?.pricingSnapshotId ?? null,
      state: 'DISPATCHED', dispatchedAt: now, updatedAt: now,
    });
    return true;
  });
}

function lostOwnership() {
  return new PipelineDomainError({ code: 'pipeline_aborted', message: 'Provider dispatch no longer owns its Runtime run.' });
}
