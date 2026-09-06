import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import type { RuntimeUsageAttribution } from '@/shared/contracts/runtime-usage-attribution';
import { pipelineNodeRun, pipelineRun } from '../adapters/postgres/pipeline-schema';
import type { PipelineExecutionContext } from '../contracts/pipeline-contracts';

/** Called only by production handlers; public generation input cannot provide these links. */
export async function getRuntimeGenerationAttribution(
  context: PipelineExecutionContext,
  nodeId: string,
): Promise<RuntimeUsageAttribution | undefined> {
  const [row] = await getDb().select({
    serviceClientId: pipelineRun.runtimeServiceClientId,
    grantId: pipelineRun.runtimeGrantId,
    runtimeSnapshot: pipelineRun.runtimeSnapshot,
    pipelineNodeRunId: pipelineNodeRun.id,
  }).from(pipelineRun).leftJoin(pipelineNodeRun, and(
    eq(pipelineNodeRun.pipelineRunId, pipelineRun.id),
    eq(pipelineNodeRun.nodeId, nodeId),
    eq(pipelineNodeRun.attemptCount, pipelineRun.attemptCount),
  )).where(and(
    eq(pipelineRun.id, context.runId),
    eq(pipelineRun.workspaceId, context.workspaceId),
  )).orderBy(desc(pipelineNodeRun.startedAt)).limit(1);
  if (!row) throw new Error('Pipeline execution run is unavailable for usage attribution.');
  if (!row.serviceClientId) return undefined;
  const capabilityKey = row.runtimeSnapshot?.capabilityKey;
  if (!row.grantId || !capabilityKey || !row.pipelineNodeRunId) throw new Error('Runtime usage attribution is incomplete.');
  return {
    pipelineRunId: context.runId,
    pipelineNodeRunId: row.pipelineNodeRunId,
    serviceClientId: row.serviceClientId,
    grantId: row.grantId,
    capabilityKey,
  };
}
