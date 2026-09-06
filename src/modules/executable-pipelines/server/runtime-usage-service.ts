import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { usageEvent } from '@/shared/db/schema/usage';
import { generationJob } from '@/shared/db/schema/generation';
import { pipelineRun } from '../adapters/postgres/pipeline-schema';
import { runtimeCostReservation } from '../adapters/postgres/runtime-cost-schema';
import type { RuntimeUsage } from '../contracts/runtime-usage-contracts';
import { aggregateRuntimeUsage, type RuntimeUsageCall } from '../core/runtime-usage-aggregate';

export type RuntimeUsageTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** Callers authorize the run first. This API never makes a paid call or guesses current prices. */
export function getRuntimeRunUsage(runId: string): Promise<RuntimeUsage> {
  return getDb().transaction((transaction) => refreshRuntimeRunUsage(transaction, runId));
}

/** Terminal-transition hook: legacy v1 rows are deliberately left untouched. */
export async function refreshRuntimeUsageIfPresent(transaction: RuntimeUsageTransaction, runId: string) {
  const [row] = await transaction.select({ clientId: pipelineRun.runtimeServiceClientId })
    .from(pipelineRun).where(eq(pipelineRun.id, runId)).limit(1);
  return row?.clientId ? refreshRuntimeRunUsage(transaction, runId) : null;
}

export async function lockRuntimeUsageRun(transaction: RuntimeUsageTransaction, runId: string) {
  const [run] = await transaction.select().from(pipelineRun)
    .where(eq(pipelineRun.id, runId)).for('update').limit(1);
  if (!run?.runtimeServiceClientId || !run.runtimeSnapshot) throw new Error('Runtime usage run is unavailable.');
  return run;
}

export async function refreshRuntimeRunUsage(transaction: RuntimeUsageTransaction, runId: string) {
  const run = await lockRuntimeUsageRun(transaction, runId);
  const events = await transaction.select().from(usageEvent).where(and(
    eq(usageEvent.pipelineRunId, run.id), eq(usageEvent.workspaceId, run.workspaceId),
  ));
  const reservations = await transaction.select({
    reservation: runtimeCostReservation,
    providerOperationId: generationJob.providerOperationId,
  }).from(runtimeCostReservation).innerJoin(generationJob, and(
    eq(generationJob.id, runtimeCostReservation.generationJobId),
    eq(generationJob.workspaceId, run.workspaceId),
  )).where(eq(runtimeCostReservation.pipelineRunId, run.id));
  const reconciliationDeadline = Date.now() - 24 * 60 * 60 * 1_000;
  const withinReconciliationWindow = !run.finishedAt || run.finishedAt.getTime() > reconciliationDeadline;
  const calls: RuntimeUsageCall[] = reservations.map(({ reservation, providerOperationId }) => ({
    physicalCallId: `${reservation.generationJobId}:${reservation.attemptCount}`,
    revision: -1,
    inputTokens: null, outputTokens: null, totalTokens: null,
    providerCostUsd: reservation.actualCostUsd,
    canReconcile: Boolean(providerOperationId) && withinReconciliationWindow,
  }));
  calls.push(...events.map((event) => ({
    physicalCallId: `${event.generationJobId}:${event.attemptCount}`,
    revision: event.callIndex,
    inputTokens: event.inputTokens, outputTokens: event.outputTokens, totalTokens: event.totalTokens,
    providerCostUsd: event.providerCostUsd,
    canReconcile: Boolean(event.providerOperationId) && withinReconciliationWindow,
  })));
  const usage = aggregateRuntimeUsage({
    calls,
    terminal: ['succeeded', 'failed', 'canceled'].includes(run.status),
    deterministic: !run.runtimeSnapshot!.cost.hasProviderCalls,
    estimate: run.runtimeSnapshot!.cost.estimate,
  });
  await transaction.update(pipelineRun).set({
    actualCostUsd: usage.actualProviderCostUsd,
    totalTokens: usage.totalTokens,
  }).where(eq(pipelineRun.id, run.id));
  return usage;
}

/** Latest reconciliation replaces the estimate for that call; it never creates another dispatch. */
export async function settleRuntimeUsageCall(transaction: RuntimeUsageTransaction, input: {
  runId: string;
  generationJobId: string;
  attemptCount: number;
}) {
  const events = await transaction.select().from(usageEvent).where(and(
    eq(usageEvent.pipelineRunId, input.runId),
    eq(usageEvent.generationJobId, input.generationJobId),
    eq(usageEvent.attemptCount, input.attemptCount),
  ));
  const latest = events.reduce<(typeof events)[number] | null>((prior, event) => (
    !prior || event.callIndex > prior.callIndex ? event : prior
  ), null);
  if (!latest) return;
  await transaction.update(runtimeCostReservation).set({
    actualCostUsd: latest.providerCostUsd,
    state: latest.providerCostUsd === null ? 'DISPATCHED' : 'SETTLED',
    updatedAt: new Date(),
  }).where(and(
    eq(runtimeCostReservation.pipelineRunId, input.runId),
    eq(runtimeCostReservation.generationJobId, input.generationJobId),
    eq(runtimeCostReservation.attemptCount, input.attemptCount),
  ));
  await refreshRuntimeRunUsage(transaction, input.runId);
}
