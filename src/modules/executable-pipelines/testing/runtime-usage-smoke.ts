import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { usageEvent } from '@/shared/db/schema/usage';
import { createUuidV7 } from '@/shared/lib/id';
import { recordUsageEvent } from '@/modules/usage';
import { pipelineNodeRun, pipelineRun } from '../adapters/postgres/pipeline-schema';
import { runtimeCostReservation } from '../adapters/postgres/runtime-cost-schema';
import { RuntimeCostError } from '../core/runtime-cost-policy';
import { markRuntimeProviderDispatched } from '../server/runtime-cost-dispatch';
import { getRuntimeRunUsage } from '../server/runtime-usage-service';

/** Only for a disposable smoke database and a dedicated run owned by the smoke harness. */
export async function runRuntimeUsagePersistenceChecks(input: { runId: string; actorUserId: string }) {
  const [run] = await getDb().select().from(pipelineRun).where(eq(pipelineRun.id, input.runId)).limit(1);
  assert.ok(run?.runtimeSnapshot && run.runtimeServiceClientId && run.runtimeGrantId);
  const nodeRunId = createUuidV7();
  const cost = {
    ...run.runtimeSnapshot.cost,
    mode: 'STRICT' as const, enforcement: 'ENFORCED' as const, hasProviderCalls: true,
    effectiveMaximumProviderCostUsd: '0.10000000',
    estimate: { min: '0', max: '0.10', pricingSnapshotId: 'fake-smoke-only', confidence: 'UPPER_BOUND' as const },
  };
  await getDb().update(pipelineRun).set({
    runtimeSnapshot: { ...run.runtimeSnapshot, cost }, status: 'running', attemptCount: 1,
    cancelRequestedAt: null, finishedAt: null, leaseExpiresAt: new Date(Date.now() + 60_000),
  }).where(eq(pipelineRun.id, run.id));
  await getDb().insert(pipelineNodeRun).values({
    id: nodeRunId, pipelineRunId: run.id, nodeId: 'runtime-usage-fixture',
    handlerType: 'fake.cost-fixture', handlerVersion: '1', status: 'running', attemptCount: 1,
  });
  const makeJob = async () => {
    const id = createUuidV7();
    await getDb().insert(generationJob).values({
      id, workspaceId: run.workspaceId, createdByUserId: input.actorUserId,
      pipelineRunId: run.id, pipelineNodeRunId: nodeRunId,
      serviceClientId: run.runtimeServiceClientId, grantId: run.runtimeGrantId,
      capabilityKey: run.runtimeSnapshot!.capabilityKey,
      idempotencyKey: `usage-smoke:${id}`, provider: 'fake', modelId: 'fake/cost-fixture',
      operation: 'smoke', status: 'running', attemptCount: 1,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    return id;
  };
  const bound = (maximumUsd: string) => ({ maximumUsd, pricingSnapshotId: 'fake-smoke-only', guaranteed: true });
  const jobs = await Promise.all([makeJob(), makeJob()]);
  const race = await Promise.allSettled(jobs.map((jobId) => markRuntimeProviderDispatched({
    jobId, attemptCount: 1, trustedBound: bound('0.06'),
  })));
  assert.equal(race.filter((entry) => entry.status === 'fulfilled').length, 1);
  const denied = race.find((entry) => entry.status === 'rejected');
  assert.ok(denied?.status === 'rejected' && denied.reason instanceof RuntimeCostError);
  assert.equal(denied.reason.code, 'cost_limit_exceeded');
  const winner = jobs[race.findIndex((entry) => entry.status === 'fulfilled')];
  const loser = jobs[race.findIndex((entry) => entry.status === 'rejected')];
  const record = (jobId: string, attemptCount: number, providerCostUsd: string | null, callIndex = 0) => (
    recordUsageEvent({
      generationJobId: jobId, attemptCount, callIndex, providerCostUsd,
      providerOperationId: `fake:${jobId}:${attemptCount}`, succeeded: jobId === winner,
      inputTokens: 10, outputTokens: 5, totalTokens: 15,
    })
  );
  await record(winner, 1, '0.04');
  await record(winner, 1, '0.04'); // the same ledger write cannot double charge
  await markRuntimeProviderDispatched({ jobId: loser, attemptCount: 1, trustedBound: bound('0.05') });
  await record(loser, 1, '0.01'); // paid failure remains part of production cost
  await getDb().update(generationJob).set({
    attemptCount: 2, providerDispatchedAt: null, providerDispatchedAttempt: null,
  }).where(eq(generationJob.id, winner));
  await markRuntimeProviderDispatched({ jobId: winner, attemptCount: 2, trustedBound: bound('0.04') });
  await record(winner, 2, null);
  await getDb().update(pipelineRun).set({ status: 'failed', finishedAt: new Date() }).where(eq(pipelineRun.id, run.id));
  const partial = await getRuntimeRunUsage(run.id);
  assert.equal(partial.state, 'PARTIAL');
  assert.equal(partial.actualProviderCostUsd, null);
  assert.equal(partial.knownProviderCostUsd, '0.05000000');
  assert.equal(partial.providerCallCount, 3);
  await record(winner, 2, '0.02', 1); // late price revision replaces the null snapshot
  for (const status of ['succeeded', 'failed', 'canceled'] as const) {
    await getDb().update(pipelineRun).set({ status }).where(eq(pipelineRun.id, run.id));
    const result = await getRuntimeRunUsage(run.id);
    assert.equal(result.state, 'COMPLETE');
    assert.equal(result.actualProviderCostUsd, '0.07000000');
    assert.equal(result.providerCallCount, 3);
    assert.equal(result.pricedCallCount, 3);
    assert.equal(result.totalTokens, '45');
  }
  const rows = await getDb().select().from(usageEvent).where(eq(usageEvent.pipelineRunId, run.id));
  assert.equal(rows.length, 4); // three physical calls, four append-only observations
  assert.ok(rows.every((row) => row.serviceClientId === run.runtimeServiceClientId
    && row.grantId === run.runtimeGrantId && row.pipelineNodeRunId === nodeRunId));
  const reservations = await getDb().select().from(runtimeCostReservation).where(eq(runtimeCostReservation.pipelineRunId, run.id));
  assert.equal(reservations.length, 3);
  assert.ok(reservations.every((entry) => entry.state === 'SETTLED'));
  const [snapshot] = await getDb().select().from(pipelineRun).where(eq(pipelineRun.id, run.id));
  assert.equal(snapshot.actualCostUsd, '0.07000000');
  assert.equal(snapshot.runtimeSnapshot?.cost.estimate?.pricingSnapshotId, 'fake-smoke-only');
  await assert.rejects(markRuntimeProviderDispatched({ jobId: winner, attemptCount: 2, trustedBound: bound('0.01') }));
  const [loserJob] = await getDb().select().from(generationJob).where(and(
    eq(generationJob.id, loser), eq(generationJob.pipelineRunId, run.id),
  ));
  assert.equal(loserJob.attemptCount, 1);
  return { providerCalls: 3, usageObservations: 4, actualProviderCostUsd: '0.07000000', reservationRace: 'one-admitted' };
}
