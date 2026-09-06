import {
  and,
  eq,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { pipelineRun } from './pipeline-schema';
import { refreshRuntimeUsageIfPresent } from '../../server/runtime-usage-service';

export async function findPipelineRunByIdempotency(
  pipelineId: string,
  sourceApplication: string,
  idempotencyKey: string,
) {
  const [record] = await getDb().select().from(pipelineRun).where(and(
    isNull(pipelineRun.runtimeServiceClientId),
    eq(pipelineRun.pipelineId, pipelineId),
    eq(pipelineRun.sourceApplication, sourceApplication),
    eq(pipelineRun.idempotencyKey, idempotencyKey),
  )).limit(1);
  return record;
}

export async function cancelOwnedPipelineRun(
  runId: string,
  attemptCount: number,
  at: Date,
) {
  const [canceled] = await getDb().update(pipelineRun).set({
    status: 'canceled',
    resultPayload: null,
    retryable: false,
    errorCode: 'pipeline_aborted',
    errorMessage: 'Pipeline run was canceled.',
    leaseExpiresAt: null,
    retryAvailableAt: null,
    finishedAt: at,
    updatedAt: at,
  }).where(and(
    eq(pipelineRun.id, runId),
    eq(pipelineRun.status, 'running'),
    eq(pipelineRun.attemptCount, attemptCount),
    isNotNull(pipelineRun.cancelRequestedAt),
  )).returning({ id: pipelineRun.id });
  if (canceled) await getDb().transaction((tx) => refreshRuntimeUsageIfPresent(tx, runId));
  return Boolean(canceled);
}

export async function closeExpiredPipelineRuns(
  transaction: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  at: Date,
) {
  const canceled = await transaction.update(pipelineRun).set({
    status: 'canceled',
    retryable: false,
    leaseExpiresAt: null,
    retryAvailableAt: null,
    finishedAt: at,
    updatedAt: at,
  }).where(and(
    eq(pipelineRun.status, 'running'),
    isNotNull(pipelineRun.cancelRequestedAt),
    or(isNull(pipelineRun.leaseExpiresAt), lte(pipelineRun.leaseExpiresAt, at)),
  )).returning({ id: pipelineRun.id });

  const failed = await transaction.update(pipelineRun).set({
    status: 'failed',
    retryable: false,
    errorCode: 'pipeline_max_attempts_exhausted',
    errorMessage: 'Pipeline run lease expired after the final attempt.',
    leaseExpiresAt: null,
    retryAvailableAt: null,
    finishedAt: at,
    updatedAt: at,
  }).where(and(
    eq(pipelineRun.status, 'running'),
    isNull(pipelineRun.cancelRequestedAt),
    sql`${pipelineRun.attemptCount} >= ${pipelineRun.maxAttempts}`,
    or(isNull(pipelineRun.leaseExpiresAt), lte(pipelineRun.leaseExpiresAt, at)),
  )).returning({ id: pipelineRun.id });
  for (const run of [...canceled, ...failed]) await refreshRuntimeUsageIfPresent(transaction, run.id);
}
