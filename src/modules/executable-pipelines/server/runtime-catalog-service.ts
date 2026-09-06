import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { executablePipeline, pipelineEndpoint, pipelineVersion } from '../adapters/postgres/pipeline-schema';
import { runtimeV2PipelineSchema, runtimeV2PipelineVersionDescriptorSchema, runtimeV2VersionSchema } from '../contracts/runtime-v2-descriptor-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { requireRuntimeScope } from '../core/runtime-v2-credentials';
import { normalizeRuntimePipelineReference } from '../core/runtime-v2-versions';
import { requireRuntimeAdmin, type RuntimeDatabase, type RuntimeManagementActor } from './runtime-client-auth';

export type RuntimePublishedVersion = { pipeline: typeof executablePipeline.$inferSelect; endpoint: typeof pipelineEndpoint.$inferSelect; version: typeof pipelineVersion.$inferSelect };
export function toRuntimeVersion(version: typeof pipelineVersion.$inferSelect) {
  return runtimeV2VersionSchema.parse({ version: version.version, checksum: version.checksum,
    inputSchemaChecksum: version.inputSchemaChecksum, outputSchemaChecksum: version.outputSchemaChecksum,
    capabilityKey: version.sourceMetadata?.capabilityKey ?? null, publishedAt: version.publishedAt.toISOString() });
}
export function runtimeVersionBoundaries(version: typeof pipelineVersion.$inferSelect) {
  return { input: { fields: version.compiledPlan.definition.inputs, schemaChecksum: version.inputSchemaChecksum, semanticContract: version.compiledPlan.definition.inputSemanticContract ?? null },
    output: { fields: version.compiledPlan.definition.outputContracts ?? {}, schemaChecksum: version.outputSchemaChecksum, semanticContract: version.compiledPlan.definition.outputSemanticContract ?? null } };
}
export async function listRuntimePipelines(actor: RuntimeManagementActor) {
  if (actor.kind === 'session') await requireRuntimeAdmin(actor);
  else requireRuntimeScope(actor.scopes, 'pipeline.catalog.read');
  const rows = await getDb().select({ pipeline: executablePipeline, endpoint: pipelineEndpoint, version: pipelineVersion }).from(executablePipeline)
    .innerJoin(pipelineEndpoint, eq(pipelineEndpoint.pipelineId, executablePipeline.id))
    .innerJoin(pipelineVersion, and(eq(pipelineVersion.id, pipelineEndpoint.activeVersionId), eq(pipelineVersion.pipelineId, executablePipeline.id)))
    .where(and(eq(executablePipeline.workspaceId, actor.workspaceId), eq(executablePipeline.status, 'active'), eq(pipelineEndpoint.enabled, true)))
    .orderBy(desc(pipelineVersion.publishedAt));
  return rows.map((row) => runtimeV2PipelineSchema.parse({ publicId: row.endpoint.publicId, name: row.pipeline.name,
    description: row.pipeline.description, latest: toRuntimeVersion(row.version), ...runtimeVersionBoundaries(row.version) }));
}
export async function findRuntimePublishedVersion(workspaceId: string, reference: string, number?: number, db: RuntimeDatabase = getDb()): Promise<RuntimePublishedVersion> {
  const publicId = normalizeRuntimePipelineReference(reference);
  const [row] = await db.select({ pipeline: executablePipeline, endpoint: pipelineEndpoint, version: pipelineVersion }).from(executablePipeline)
    .innerJoin(pipelineEndpoint, eq(pipelineEndpoint.pipelineId, executablePipeline.id))
    .innerJoin(pipelineVersion, and(eq(pipelineVersion.pipelineId, executablePipeline.id), number === undefined ? eq(pipelineVersion.id, pipelineEndpoint.activeVersionId) : eq(pipelineVersion.version, number)))
    .where(and(eq(executablePipeline.workspaceId, workspaceId), eq(pipelineEndpoint.publicId, publicId))).for('share').limit(1);
  if (!row) throw new RuntimeV2Error('pipeline_not_found', 'Published pipeline version was not found.', 404);
  if (!row.endpoint.enabled || row.pipeline.status !== 'active') throw new RuntimeV2Error('pipeline_disabled', 'This pipeline is not available.', 409);
  return row;
}
export async function listRuntimePipelineVersions(actor: RuntimeManagementActor, reference: string) {
  if (actor.kind === 'session') await requireRuntimeAdmin(actor);
  else requireRuntimeScope(actor.scopes, 'pipeline.catalog.read');
  const current = await findRuntimePublishedVersion(actor.workspaceId, reference);
  return (await getDb().select().from(pipelineVersion).where(eq(pipelineVersion.pipelineId, current.pipeline.id)).orderBy(desc(pipelineVersion.version))).map(toRuntimeVersion);
}
export async function getRuntimePipelineVersionDescriptor(actor: RuntimeManagementActor, reference: string, version: number) {
  if (actor.kind === 'session') await requireRuntimeAdmin(actor);
  else requireRuntimeScope(actor.scopes, 'pipeline.catalog.read');
  const row = await findRuntimePublishedVersion(actor.workspaceId, reference, version);
  return runtimeV2PipelineVersionDescriptorSchema.parse({ pipelinePublicId: row.endpoint.publicId, pipelineName: row.pipeline.name,
    version: toRuntimeVersion(row.version), ...runtimeVersionBoundaries(row.version) });
}
