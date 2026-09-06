import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { createUuidV7 } from '@/shared/lib/id';
import { runtimeGrantAudit, runtimePipelineGrant } from '../adapters/postgres/runtime-schema';
import { runtimeV2CreateGrantSchema, runtimeV2RepinSchema, type RuntimeV2Repin } from '../contracts/runtime-v2-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { requireRuntimeClient, writeRuntimeAudit, type RuntimeManagementActor } from './runtime-client-auth';
import { findRuntimePublishedVersion, type RuntimePublishedVersion } from './runtime-catalog-service';
import { resolveRuntimeGrant, runtimeVersionComparison, toRuntimeGrant } from './runtime-grant-read-service';

function assertVersionRequest(version: RuntimePublishedVersion['version'], expected: Omit<RuntimeV2Repin, 'expectedGrantRevision'>, capabilityKey: string) {
  if (version.sourceMetadata?.capabilityKey !== capabilityKey) throw new RuntimeV2Error('capability_mismatch', 'This version does not provide the required capability.', 409);
  if (version.version !== expected.version || version.checksum !== expected.checksum || version.inputSchemaChecksum !== expected.inputSchemaChecksum || version.outputSchemaChecksum !== expected.outputSchemaChecksum) throw new RuntimeV2Error('contract_checksum_mismatch', 'The version or contract checksum changed. Refresh the descriptor.', 409);
}
function grantPin(version: RuntimePublishedVersion['version']) {
  return { pinnedVersionId: version.id, pinnedVersion: version.version, pipelineChecksum: version.checksum,
    inputSchemaChecksum: version.inputSchemaChecksum!, outputSchemaChecksum: version.outputSchemaChecksum! };
}
export async function createRuntimeGrant(actor: RuntimeManagementActor, clientId: string, body: unknown) {
  const data = runtimeV2CreateGrantSchema.parse(body);
  if (data.updatePolicy !== 'PINNED' && actor.kind !== 'session') throw new RuntimeV2Error('missing_scope', 'Only a Workspace administrator can opt into automatic updates.', 403);
  if (data.updatePolicy === 'FOLLOW_LATEST_DEV' && !(process.env.NODE_ENV !== 'production' && process.env.RUNTIME_ALLOW_FOLLOW_LATEST_DEV === 'true')) throw new RuntimeV2Error('update_policy_disabled', 'Development update policy is not enabled.');
  return getDb().transaction(async (tx) => {
    const client = await requireRuntimeClient(actor, clientId, tx, true);
    if (!client.enabled) throw new RuntimeV2Error('disabled_service_client', 'The connection is disabled.', 403);
    const target = await findRuntimePublishedVersion(actor.workspaceId, data.pipeline, data.version, tx);
    assertVersionRequest(target.version, data, data.capabilityKey);
    const id = createUuidV7();
    await tx.insert(runtimePipelineGrant).values({ id, serviceClientId: clientId, pipelineId: target.pipeline.id,
      capabilityKey: data.capabilityKey, ...grantPin(target.version), updatePolicy: data.updatePolicy,
      executionPolicy: data.executionPolicy, costPolicy: data.costPolicy });
    await writeRuntimeAudit(tx, actor, { serviceClientId: clientId, grantId: id, action: 'grant.created', after: { ...grantPin(target.version), revision: 1, capabilityKey: data.capabilityKey } });
    return toRuntimeGrant(await resolveRuntimeGrant(actor, id, tx));
  });
}
export async function repinRuntimeGrant(actor: RuntimeManagementActor, grantId: string, body: unknown, rollback = false) {
  const data = runtimeV2RepinSchema.parse(body);
  return getDb().transaction(async (tx) => {
    // Client lock serializes grant edits and run creation in the same lock order.
    const current = await resolveRuntimeGrant(actor, grantId, tx, true);
    await requireRuntimeClient(actor, current.client.id, tx, true);
    if (current.grant.revision !== data.expectedGrantRevision) throw new RuntimeV2Error('stale_grant_revision', 'The grant changed. Refresh it before updating.', 409);
    const target = await findRuntimePublishedVersion(actor.workspaceId, current.endpoint.publicId, data.version, tx);
    assertVersionRequest(target.version, data, current.grant.capabilityKey);
    if (runtimeVersionComparison(current.version, target.version, current.grant.updatePolicy).structural !== 'COMPATIBLE') throw new RuntimeV2Error('incompatible_repin', 'This version changes the contract. Create a separately reviewed grant.', 409);
    if (rollback) {
      const history = await tx.select({ before: runtimeGrantAudit.before, after: runtimeGrantAudit.after }).from(runtimeGrantAudit).where(eq(runtimeGrantAudit.grantId, grantId));
      if (!history.some((event) => event.before?.pinnedVersionId === target.version.id || event.after?.pinnedVersionId === target.version.id)) throw new RuntimeV2Error('rollback_version_unavailable', 'Rollback is limited to a previously pinned version.', 409);
    }
    if (current.version.id === target.version.id) return toRuntimeGrant(current);
    const [changed] = await tx.update(runtimePipelineGrant).set({ ...grantPin(target.version), revision: current.grant.revision + 1 })
      .where(and(eq(runtimePipelineGrant.id, grantId), eq(runtimePipelineGrant.revision, data.expectedGrantRevision))).returning();
    if (!changed) throw new RuntimeV2Error('stale_grant_revision', 'The grant changed. Refresh it before updating.', 409);
    await writeRuntimeAudit(tx, actor, { serviceClientId: current.client.id, grantId, action: rollback ? 'grant.rolled_back' : 'grant.repinned',
      before: { ...grantPin(current.version), revision: current.grant.revision }, after: { ...grantPin(target.version), revision: changed.revision } });
    return toRuntimeGrant(await resolveRuntimeGrant(actor, grantId, tx, true));
  });
}
export async function setRuntimeGrantEnabled(actor: RuntimeManagementActor, grantId: string, enabled: boolean, expectedGrantRevision: number) {
  return getDb().transaction(async (tx) => {
    const row = await resolveRuntimeGrant(actor, grantId, tx, true);
    await requireRuntimeClient(actor, row.client.id, tx, true);
    const [changed] = await tx.update(runtimePipelineGrant).set({ enabled, revision: expectedGrantRevision + 1 })
      .where(and(eq(runtimePipelineGrant.id, grantId), eq(runtimePipelineGrant.revision, expectedGrantRevision))).returning();
    if (!changed) throw new RuntimeV2Error('stale_grant_revision', 'The grant changed. Refresh it before updating.', 409);
    await writeRuntimeAudit(tx, actor, { serviceClientId: row.client.id, grantId, action: enabled ? 'grant.enabled' : 'grant.disabled', before: { enabled: row.grant.enabled, revision: row.grant.revision }, after: { enabled, revision: changed.revision } });
    return toRuntimeGrant(await resolveRuntimeGrant(actor, grantId, tx, true));
  });
}
