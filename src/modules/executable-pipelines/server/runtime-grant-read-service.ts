import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { executablePipeline, pipelineEndpoint, pipelineVersion } from '../adapters/postgres/pipeline-schema';
import { runtimeGrantAudit, runtimePipelineGrant, runtimeServiceClient } from '../adapters/postgres/runtime-schema';
import { runtimeV2GrantSchema, runtimeV2UpdatesSchema } from '../contracts/runtime-v2-descriptor-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { compareRuntimeVersions } from '../core/runtime-v2-versions';
import { requireRuntimeClient, type RuntimeDatabase, type RuntimeManagementActor } from './runtime-client-auth';
import { findRuntimePublishedVersion, runtimeVersionBoundaries, toRuntimeVersion } from './runtime-catalog-service';

export async function resolveRuntimeGrant(actor: RuntimeManagementActor, grantId: string, db: RuntimeDatabase = getDb(), allowDisabled = false) {
  const [hint] = await db.select({ clientId: runtimePipelineGrant.serviceClientId }).from(runtimePipelineGrant)
    .innerJoin(runtimeServiceClient, eq(runtimeServiceClient.id, runtimePipelineGrant.serviceClientId))
    .where(and(eq(runtimePipelineGrant.id, grantId), eq(runtimeServiceClient.workspaceId, actor.workspaceId), actor.kind === 'client' ? eq(runtimePipelineGrant.serviceClientId, actor.serviceClientId) : undefined)).limit(1);
  if (!hint) throw new RuntimeV2Error('grant_not_found', 'Pipeline grant was not found.', 404);
  const client = await requireRuntimeClient(actor, hint.clientId, db);
  const [row] = await db.select({ grant: runtimePipelineGrant, pipeline: executablePipeline, endpoint: pipelineEndpoint, version: pipelineVersion })
    .from(runtimePipelineGrant).innerJoin(executablePipeline, eq(executablePipeline.id, runtimePipelineGrant.pipelineId))
    .innerJoin(pipelineEndpoint, eq(pipelineEndpoint.pipelineId, runtimePipelineGrant.pipelineId))
    .innerJoin(pipelineVersion, and(eq(pipelineVersion.id, runtimePipelineGrant.pinnedVersionId), eq(pipelineVersion.pipelineId, runtimePipelineGrant.pipelineId)))
    .where(and(eq(runtimePipelineGrant.id, grantId), eq(executablePipeline.workspaceId, actor.workspaceId), actor.kind === 'client' ? eq(runtimePipelineGrant.serviceClientId, actor.serviceClientId) : undefined))
    .for('share').limit(1);
  if (!row) throw new RuntimeV2Error('grant_not_found', 'Pipeline grant was not found.', 404);
  if (!allowDisabled && !row.grant.enabled) throw new RuntimeV2Error('grant_disabled', 'This pipeline grant is disabled.', 403);
  if (!allowDisabled && (!row.endpoint.enabled || row.pipeline.status !== 'active')) throw new RuntimeV2Error('pipeline_disabled', 'This pipeline is not available.', 409);
  assertRuntimeGrantSnapshot(row.grant, row.version);
  return { ...row, client };
}
export function assertRuntimeGrantSnapshot(grant: typeof runtimePipelineGrant.$inferSelect, version: typeof pipelineVersion.$inferSelect) {
  if (grant.pinnedVersion !== version.version || grant.pipelineChecksum !== version.checksum || grant.inputSchemaChecksum !== version.inputSchemaChecksum || grant.outputSchemaChecksum !== version.outputSchemaChecksum || grant.capabilityKey !== version.sourceMetadata?.capabilityKey) {
    throw new RuntimeV2Error('contract_checksum_mismatch', 'The published contract does not match this grant.', 409);
  }
}
export function toRuntimeGrant(row: Awaited<ReturnType<typeof resolveRuntimeGrant>>) {
  return runtimeV2GrantSchema.parse({ id: row.grant.id, serviceClientId: row.grant.serviceClientId,
    pipelinePublicId: row.endpoint.publicId, pipelineName: row.pipeline.name, capabilityKey: row.grant.capabilityKey,
    enabled: row.grant.enabled, revision: row.grant.revision, updatePolicy: row.grant.updatePolicy,
    executionPolicy: row.grant.executionPolicy, costPolicy: row.grant.costPolicy,
    pinned: toRuntimeVersion(row.version), ...runtimeVersionBoundaries(row.version),
    createdAt: row.grant.createdAt.toISOString(), updatedAt: row.grant.updatedAt.toISOString() });
}
export async function getRuntimeGrant(actor: RuntimeManagementActor, grantId: string) {
  return toRuntimeGrant(await resolveRuntimeGrant(actor, grantId, getDb(), actor.kind === 'session'));
}
export async function listRuntimeGrants(actor: RuntimeManagementActor, clientId: string) {
  await requireRuntimeClient(actor, clientId);
  const rows = await getDb().select({ id: runtimePipelineGrant.id }).from(runtimePipelineGrant).where(eq(runtimePipelineGrant.serviceClientId, clientId)).orderBy(desc(runtimePipelineGrant.createdAt));
  return Promise.all(rows.map(async (row) => toRuntimeGrant(await resolveRuntimeGrant(actor, row.id, getDb(), true))));
}
export function runtimeVersionComparison(pinned: typeof pipelineVersion.$inferSelect, candidate: typeof pipelineVersion.$inferSelect, updatePolicy: (typeof runtimePipelineGrant.$inferSelect)['updatePolicy']) {
  const comparable = (version: typeof pipelineVersion.$inferSelect) => ({ ...toRuntimeVersion(version), semantic: {
    input: version.compiledPlan.definition.inputSemanticContract ?? null,
    output: version.compiledPlan.definition.outputSemanticContract ?? null,
  } });
  return compareRuntimeVersions({ pinned: comparable(pinned), candidate: comparable(candidate), updatePolicy });
}
export async function getRuntimeGrantUpdates(actor: RuntimeManagementActor, grantId: string) {
  const row = await resolveRuntimeGrant(actor, grantId, getDb(), actor.kind === 'session');
  const latest = await findRuntimePublishedVersion(actor.workspaceId, row.endpoint.publicId);
  const audit = await getDb().select({ before: runtimeGrantAudit.before, after: runtimeGrantAudit.after }).from(runtimeGrantAudit).where(eq(runtimeGrantAudit.grantId, grantId));
  const previousIds = [...new Set(audit.flatMap((event) => [event.before?.pinnedVersionId, event.after?.pinnedVersionId]))]
    .filter((id): id is string => typeof id === 'string' && id !== row.version.id);
  const rollbackVersions = previousIds.length ? (await getDb().select().from(pipelineVersion)
    .where(and(eq(pipelineVersion.pipelineId, row.pipeline.id), inArray(pipelineVersion.id, previousIds)))
    .orderBy(desc(pipelineVersion.version))).map(toRuntimeVersion) : [];
  return runtimeV2UpdatesSchema.parse({ grantId, pipelinePublicId: row.endpoint.publicId, capabilityKey: row.grant.capabilityKey,
    grantRevision: row.grant.revision, pinned: toRuntimeVersion(row.version), latest: toRuntimeVersion(latest.version),
    updateAvailable: latest.version.version > row.version.version, rollbackVersions,
    compatibility: runtimeVersionComparison(row.version, latest.version, row.grant.updatePolicy) });
}
