import { and, count, desc, eq, sql } from 'drizzle-orm';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { getDb } from '@/shared/db/client';
import { document } from '@/shared/db/schema/document';
import {
  executablePipeline,
  pipelineEndpoint,
  pipelineRun,
  pipelineVersion,
} from '../adapters/postgres/pipeline-schema';
import type {
  ExecutablePipelineCatalog,
} from '../contracts/pipeline-catalog-contracts';
import { mapExecutablePipelineCatalogRow } from './pipeline-catalog-mapping';

export async function listExecutablePipelineCatalog(input: {
  userId: string;
  workspaceId: string;
}): Promise<ExecutablePipelineCatalog> {
  await requireWorkspaceMembership(input.userId, input.workspaceId);

  const runStats = getDb().select({
    pipelineId: pipelineRun.pipelineId,
    invocationCount: count(pipelineRun.id).as('invocation_count'),
    totalTokens: sql<string>`coalesce(sum(${pipelineRun.totalTokens}), 0)::text`.as('total_tokens'),
    totalCostUsd: sql<string>`coalesce(sum(${pipelineRun.actualCostUsd}), 0)::text`.as('total_cost_usd'),
    averageCostUsd: sql<string>`case
      when count(${pipelineRun.id}) = 0 then '0'
      else (coalesce(sum(${pipelineRun.actualCostUsd}), 0) / count(${pipelineRun.id}))::text
    end`.as('average_cost_usd'),
  }).from(pipelineRun)
    .where(eq(pipelineRun.workspaceId, input.workspaceId))
    .groupBy(pipelineRun.pipelineId)
    .as('pipeline_run_stats');

  const rows = await getDb().select({
    pipelineId: executablePipeline.id,
    name: executablePipeline.name,
    description: executablePipeline.description,
    originDocumentId: executablePipeline.originDocumentId,
    originDocumentName: document.name,
    originSectionId: executablePipeline.originSectionId,
    endpointPublicId: pipelineEndpoint.publicId,
    version: pipelineVersion.version,
    publishedAt: pipelineVersion.publishedAt,
    compiledPlan: pipelineVersion.compiledPlan,
    sourceMetadata: pipelineVersion.sourceMetadata,
    invocationCount: runStats.invocationCount,
    totalTokens: runStats.totalTokens,
    totalCostUsd: runStats.totalCostUsd,
    averageCostUsd: runStats.averageCostUsd,
  }).from(executablePipeline)
    .innerJoin(pipelineEndpoint, eq(pipelineEndpoint.pipelineId, executablePipeline.id))
    .innerJoin(pipelineVersion, eq(pipelineVersion.id, pipelineEndpoint.activeVersionId))
    .leftJoin(document, eq(document.id, executablePipeline.originDocumentId))
    .leftJoin(runStats, eq(runStats.pipelineId, executablePipeline.id))
    .where(and(
      eq(executablePipeline.workspaceId, input.workspaceId),
      eq(executablePipeline.status, 'active'),
      eq(pipelineEndpoint.enabled, true),
    ))
    .orderBy(desc(executablePipeline.updatedAt), desc(executablePipeline.id));

  return { pipelines: rows.map(mapExecutablePipelineCatalogRow) };
}
