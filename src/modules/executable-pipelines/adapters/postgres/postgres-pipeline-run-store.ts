import {
  and,
  asc,
  eq,
  gt,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type {
  PipelineHeartbeatResult,
  PipelineRunQueue,
  PipelineRunStore,
} from '../../contracts/pipeline-contracts';
import { getDb } from '@/shared/db/client';
import {
  executablePipeline,
  pipelineRun,
  pipelineVersion,
} from './pipeline-schema';
import { toPipelineRunJob } from './pipeline-run-mapping';
import {
  cancelOwnedPipelineRun,
  closeExpiredPipelineRuns,
  findPipelineRunByIdempotency,
} from './pipeline-run-queries';

export type PostgresPipelineRunStore = PipelineRunQueue & PipelineRunStore & {
  getResult(runId: string): Promise<typeof pipelineRun.$inferSelect['resultPayload']>;
};

export function createPostgresPipelineRunStore(): PostgresPipelineRunStore {
  return {
    async createOrFind(input) {
      const existing = await findPipelineRunByIdempotency(
        input.pipelineId,
        input.sourceApplication,
        input.idempotencyKey,
      );
      if (existing) return { created: false, run: toPipelineRunJob(existing) };

      const [version] = await getDb().select({
        id: pipelineVersion.id,
      }).from(pipelineVersion)
        .innerJoin(
          executablePipeline,
          eq(executablePipeline.id, pipelineVersion.pipelineId),
        )
        .where(and(
          eq(pipelineVersion.pipelineId, input.pipelineId),
          eq(pipelineVersion.version, input.pipelineVersion),
          eq(executablePipeline.workspaceId, input.workspaceId),
        ))
        .limit(1);
      if (!version) {
        throw new Error('Published pipeline version was not found in the workspace.');
      }

      const [created] = await getDb().insert(pipelineRun).values({
        id: input.id,
        workspaceId: input.workspaceId,
        pipelineId: input.pipelineId,
        pipelineVersionId: version.id,
        pipelineVersion: input.pipelineVersion,
        consumerId: input.consumerId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        sourceApplication: input.sourceApplication,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        inputPayload: input.input,
        maxAttempts: input.maxAttempts,
      }).onConflictDoNothing({
        target: [
          pipelineRun.pipelineId,
          pipelineRun.sourceApplication,
          pipelineRun.idempotencyKey,
        ],
      }).returning();
      if (created) return { created: true, run: toPipelineRunJob(created) };

      const raced = await findPipelineRunByIdempotency(
        input.pipelineId,
        input.sourceApplication,
        input.idempotencyKey,
      );
      if (!raced) throw new Error('Pipeline run could not be created or found.');
      return { created: false, run: toPipelineRunJob(raced) };
    },

    async findById(runId) {
      const [record] = await getDb().select().from(pipelineRun)
        .where(eq(pipelineRun.id, runId))
        .limit(1);
      return record ? toPipelineRunJob(record) : null;
    },

    async requestCancel(input) {
      const [closed] = await getDb().update(pipelineRun).set({
        status: 'canceled',
        cancelRequestedAt: input.requestedAt,
        retryable: false,
        retryAvailableAt: null,
        leaseExpiresAt: null,
        finishedAt: input.requestedAt,
        updatedAt: input.requestedAt,
      }).where(and(
        eq(pipelineRun.id, input.runId),
        or(
          eq(pipelineRun.status, 'queued'),
          eq(pipelineRun.status, 'failed'),
        ),
      )).returning();
      if (closed) return toPipelineRunJob(closed);

      const [running] = await getDb().update(pipelineRun).set({
        cancelRequestedAt: sql`coalesce(
          ${pipelineRun.cancelRequestedAt},
          ${input.requestedAt}
        )`,
        updatedAt: input.requestedAt,
      }).where(and(
        eq(pipelineRun.id, input.runId),
        eq(pipelineRun.status, 'running'),
      )).returning();
      if (running) return toPipelineRunJob(running);

      const [terminal] = await getDb().select().from(pipelineRun)
        .where(eq(pipelineRun.id, input.runId))
        .limit(1);
      return terminal ? toPipelineRunJob(terminal) : null;
    },

    async claimNext(input) {
      const claimed = await getDb().transaction(async (transaction) => {
        await closeExpiredPipelineRuns(transaction, input.claimedAt);
        const [candidate] = await transaction.select().from(pipelineRun)
          .where(and(
            lt(pipelineRun.attemptCount, pipelineRun.maxAttempts),
            isNull(pipelineRun.cancelRequestedAt),
            or(
              eq(pipelineRun.status, 'queued'),
              and(
                eq(pipelineRun.status, 'failed'),
                eq(pipelineRun.retryable, true),
                or(
                  isNull(pipelineRun.retryAvailableAt),
                  lte(pipelineRun.retryAvailableAt, input.claimedAt),
                ),
              ),
              and(
                eq(pipelineRun.status, 'running'),
                or(
                  isNull(pipelineRun.leaseExpiresAt),
                  lte(pipelineRun.leaseExpiresAt, input.claimedAt),
                ),
              ),
            ),
          ))
          .orderBy(
            asc(sql`case ${pipelineRun.status}
              when 'queued' then 0
              when 'failed' then 1
              else 2
            end`),
            asc(sql`coalesce(
              ${pipelineRun.retryAvailableAt},
              ${pipelineRun.leaseExpiresAt},
              ${pipelineRun.enqueuedAt},
              ${pipelineRun.createdAt}
            )`),
            asc(pipelineRun.id),
          )
          .for('update', { skipLocked: true })
          .limit(1);
        if (!candidate) return null;

        const [record] = await transaction.update(pipelineRun).set({
          status: 'running',
          attemptCount: sql`${pipelineRun.attemptCount} + 1`,
          startedAt: sql`coalesce(${pipelineRun.startedAt}, ${input.claimedAt})`,
          finishedAt: null,
          leaseExpiresAt: input.leaseExpiresAt,
          retryAvailableAt: null,
          retryable: null,
          errorCode: null,
          errorMessage: null,
          updatedAt: input.claimedAt,
        }).where(and(
          eq(pipelineRun.id, candidate.id),
          eq(pipelineRun.attemptCount, candidate.attemptCount),
        )).returning();
        return record ?? null;
      });
      return claimed ? toPipelineRunJob(claimed) : null;
    },

    async heartbeat(input): Promise<PipelineHeartbeatResult> {
      const [renewed] = await getDb().update(pipelineRun).set({
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.heartbeatAt,
      }).where(and(
        eq(pipelineRun.id, input.runId),
        eq(pipelineRun.status, 'running'),
        eq(pipelineRun.attemptCount, input.attemptCount),
        isNull(pipelineRun.cancelRequestedAt),
        gt(pipelineRun.leaseExpiresAt, input.heartbeatAt),
      )).returning({ id: pipelineRun.id });
      if (renewed) return 'renewed';

      const [current] = await getDb().select({
        attemptCount: pipelineRun.attemptCount,
        cancelRequestedAt: pipelineRun.cancelRequestedAt,
        status: pipelineRun.status,
      }).from(pipelineRun).where(eq(pipelineRun.id, input.runId)).limit(1);
      return current?.status === 'running'
        && current.attemptCount === input.attemptCount
        && current.cancelRequestedAt
        ? 'canceled'
        : 'lost';
    },

    async succeed(input) {
      const [completed] = await getDb().update(pipelineRun).set({
        status: 'succeeded',
        resultPayload: input.result,
        actualCostUsd: input.result.usage?.actualCostUsd ?? null,
        totalTokens: input.result.usage?.totalTokens ?? null,
        retryable: false,
        leaseExpiresAt: null,
        retryAvailableAt: null,
        finishedAt: input.completedAt,
        updatedAt: input.completedAt,
      }).where(and(
        eq(pipelineRun.id, input.runId),
        eq(pipelineRun.status, 'running'),
        eq(pipelineRun.attemptCount, input.attemptCount),
        isNull(pipelineRun.cancelRequestedAt),
        gt(pipelineRun.leaseExpiresAt, input.completedAt),
      )).returning({ id: pipelineRun.id });
      if (completed) return true;
      return cancelOwnedPipelineRun(input.runId, input.attemptCount, input.completedAt);
    },

    async fail(input) {
      const [failed] = await getDb().update(pipelineRun).set({
        status: 'failed',
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        retryable: input.retryable,
        retryAvailableAt: input.retryable ? input.retryAvailableAt : null,
        leaseExpiresAt: null,
        finishedAt: input.failedAt,
        updatedAt: input.failedAt,
      }).where(and(
        eq(pipelineRun.id, input.runId),
        eq(pipelineRun.status, 'running'),
        eq(pipelineRun.attemptCount, input.attemptCount),
        isNull(pipelineRun.cancelRequestedAt),
        gt(pipelineRun.leaseExpiresAt, input.failedAt),
      )).returning({ id: pipelineRun.id });
      if (failed) return true;
      return cancelOwnedPipelineRun(input.runId, input.attemptCount, input.failedAt);
    },

    async cancel(input) {
      return cancelOwnedPipelineRun(input.runId, input.attemptCount, input.canceledAt);
    },

    async getResult(runId) {
      const [record] = await getDb().select({
        result: pipelineRun.resultPayload,
      }).from(pipelineRun).where(eq(pipelineRun.id, runId)).limit(1);
      return record?.result ?? null;
    },
  };
}
