import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { createUuidV7 } from '@/shared/lib/id';
import { generationJob } from '@/shared/db/schema/generation';
import {
  executablePipeline,
  pipelineNodeRun,
  pipelineVersion,
} from '../adapters/postgres/pipeline-schema';
import type {
  PipelineRunExecutor,
  PipelineValue,
} from '../contracts/pipeline-contracts';
import { executeCompiledPipeline } from '../core/pipeline-executor';
import { createProductionPipelineHandlerRegistry } from './pipeline-production-handlers';

export function createPostgresPipelineRunExecutor(): PipelineRunExecutor {
  return {
    async execute({ run, signal }) {
      const [published] = await getDb().select({
        compiledPlan: pipelineVersion.compiledPlan,
        documentId: executablePipeline.originDocumentId,
        publishedByUserId: pipelineVersion.publishedByUserId,
      }).from(pipelineVersion)
        .innerJoin(executablePipeline, eq(executablePipeline.id, pipelineVersion.pipelineId))
        .where(and(
          eq(pipelineVersion.pipelineId, run.pipelineId),
          eq(pipelineVersion.version, run.pipelineVersion),
          eq(executablePipeline.workspaceId, run.workspaceId),
        ))
        .limit(1);
      if (!published) throw new Error('Published pipeline version could not be loaded.');

      const result = await executeCompiledPipeline({
        context: {
          pipelineId: run.pipelineId,
          pipelineVersion: run.pipelineVersion,
          runId: run.id,
          sourceApplication: run.sourceApplication,
          workspaceId: run.workspaceId,
        },
        handlers: createProductionPipelineHandlerRegistry({
          actorUserId: published.publishedByUserId,
          documentId: published.documentId ?? undefined,
        }),
        inputs: run.input,
        observer: {
          async onNodeStarted({ inputs, node }) {
            const now = new Date();
            await getDb().insert(pipelineNodeRun).values({
              id: createUuidV7(),
              pipelineRunId: run.id,
              nodeId: node.id,
              handlerType: node.handlerType,
              handlerVersion: node.handlerVersion,
              status: 'running',
              attemptCount: run.attemptCount,
              inputHash: hashPipelineValue(inputs),
              startedAt: now,
            }).onConflictDoUpdate({
              target: [
                pipelineNodeRun.pipelineRunId,
                pipelineNodeRun.nodeId,
                pipelineNodeRun.attemptCount,
              ],
              set: {
                status: 'running',
                inputHash: hashPipelineValue(inputs),
                errorCode: null,
                errorMessage: null,
                startedAt: now,
                finishedAt: null,
                updatedAt: now,
              },
            });
          },
          async onNodeSucceeded({ node }) {
            const now = new Date();
            await getDb().update(pipelineNodeRun).set({
              status: 'succeeded',
              finishedAt: now,
              updatedAt: now,
            }).where(and(
              eq(pipelineNodeRun.pipelineRunId, run.id),
              eq(pipelineNodeRun.nodeId, node.id),
              eq(pipelineNodeRun.attemptCount, run.attemptCount),
            ));
          },
          async onNodeFailed({ error, node }) {
            const now = new Date();
            await getDb().update(pipelineNodeRun).set({
              status: error.code === 'pipeline_aborted' ? 'canceled' : 'failed',
              errorCode: error.code,
              errorMessage: error.message,
              finishedAt: now,
              updatedAt: now,
            }).where(and(
              eq(pipelineNodeRun.pipelineRunId, run.id),
              eq(pipelineNodeRun.nodeId, node.id),
              eq(pipelineNodeRun.attemptCount, run.attemptCount),
            ));
          },
        },
        plan: published.compiledPlan,
        signal,
      });
      const [usage] = await getDb().select({
        actualCostUsd: sql<string | null>`sum(${generationJob.providerCostUsd})::text`,
        totalTokens: sql<string | null>`sum(${generationJob.totalTokens})::text`,
      }).from(generationJob).where(and(
        eq(generationJob.workspaceId, run.workspaceId),
        sql`${generationJob.metadata}->>'pipelineRunId' = ${run.id}`,
      ));
      return {
        ...result,
        usage: {
          actualCostUsd: usage?.actualCostUsd ?? null,
          totalTokens: usage?.totalTokens ?? null,
        },
      };
    },
  };
}

function hashPipelineValue(value: Record<string, PipelineValue>) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(record[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}
