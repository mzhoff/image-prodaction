import { and, desc, eq, isNull, or, gt } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { createUuidV7 } from '@/shared/lib/id';
import { runtimeClientCredential, runtimeServiceClient } from '../adapters/postgres/runtime-schema';
import { runtimeV2ClientSchema, runtimeV2CreateClientSchema, runtimeV2CredentialSchema, runtimeV2IssueCredentialSchema } from '../contracts/runtime-v2-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { generateRuntimeClientToken, hashRuntimeClientToken, parseRuntimeClientToken } from '../core/runtime-v2-credentials';
import { requireRuntimeAdmin, requireRuntimeClient, writeRuntimeAudit, type RuntimeManagementActor, type RuntimeSessionActor } from './runtime-client-auth';

export function toRuntimeClient(row: typeof runtimeServiceClient.$inferSelect) {
  return runtimeV2ClientSchema.parse({ id: row.id, workspaceId: row.workspaceId, displayName: row.displayName,
    sourceApplication: row.sourceApplication, externalWorkspaceRef: row.externalWorkspaceRef,
    enabled: row.enabled, scopes: row.scopes, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
}
export function toRuntimeCredential(row: typeof runtimeClientCredential.$inferSelect) {
  return runtimeV2CredentialSchema.parse({ id: row.id, serviceClientId: row.serviceClientId, label: row.label,
    tokenPrefix: row.tokenPrefix, scopes: row.scopes, createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null, expiresAt: row.expiresAt?.toISOString() ?? null, revokedAt: row.revokedAt?.toISOString() ?? null });
}
export async function listRuntimeClients(actor: RuntimeSessionActor) {
  await requireRuntimeAdmin(actor);
  return (await getDb().select().from(runtimeServiceClient).where(eq(runtimeServiceClient.workspaceId, actor.workspaceId)).orderBy(desc(runtimeServiceClient.createdAt))).map(toRuntimeClient);
}
export async function getRuntimeClient(actor: RuntimeManagementActor, clientId: string) {
  return toRuntimeClient(await requireRuntimeClient(actor, clientId));
}
export async function createRuntimeClient(actor: RuntimeSessionActor, body: unknown) {
  const data = runtimeV2CreateClientSchema.parse(body);
  return getDb().transaction(async (tx) => {
    await requireRuntimeAdmin(actor, tx);
    const [row] = await tx.insert(runtimeServiceClient).values({ id: createUuidV7(), workspaceId: actor.workspaceId, createdByUserId: actor.userId, ...data }).onConflictDoNothing().returning();
    if (!row) throw new RuntimeV2Error('connection_exists', 'This application workspace is already connected.', 409);
    await writeRuntimeAudit(tx, actor, { serviceClientId: row.id, action: 'client.created', after: { scopes: row.scopes } });
    return toRuntimeClient(row);
  });
}
export async function setRuntimeClientEnabled(actor: RuntimeSessionActor, clientId: string, enabled: boolean) {
  return getDb().transaction(async (tx) => {
    const previous = await requireRuntimeClient(actor, clientId, tx);
    const [row] = await tx.update(runtimeServiceClient).set({ enabled }).where(eq(runtimeServiceClient.id, clientId)).returning();
    await writeRuntimeAudit(tx, actor, { serviceClientId: clientId, action: enabled ? 'client.enabled' : 'client.disabled', before: { enabled: previous.enabled }, after: { enabled } });
    return toRuntimeClient(row!);
  });
}
export async function listRuntimeCredentials(actor: RuntimeSessionActor, clientId: string) {
  await requireRuntimeClient(actor, clientId);
  return (await getDb().select().from(runtimeClientCredential).where(eq(runtimeClientCredential.serviceClientId, clientId)).orderBy(desc(runtimeClientCredential.createdAt))).map(toRuntimeCredential);
}
/** Issue is also rotation: at most two non-expired keys overlap, never automatically revoke. */
export async function issueRuntimeCredential(actor: RuntimeSessionActor, clientId: string, body: unknown) {
  const data = runtimeV2IssueCredentialSchema.parse(body);
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw new RuntimeV2Error('invalid_expiry', 'Expiry must be in the future.');
  return getDb().transaction(async (tx) => {
    const client = await requireRuntimeClient(actor, clientId, tx);
    if (!client.enabled) throw new RuntimeV2Error('disabled_service_client', 'Enable this connection before issuing a key.', 409);
    if (data.scopes?.some((scope) => !client.scopes.includes(scope))) throw new RuntimeV2Error('scope_escalation', 'Credential permissions cannot exceed connection permissions.', 403);
    const active = await tx.select({ id: runtimeClientCredential.id }).from(runtimeClientCredential).where(and(eq(runtimeClientCredential.serviceClientId, clientId), isNull(runtimeClientCredential.revokedAt), or(isNull(runtimeClientCredential.expiresAt), gt(runtimeClientCredential.expiresAt, new Date()))));
    if (active.length >= 2) throw new RuntimeV2Error('rotation_overlap_limit', 'Revoke an old key before issuing another key.', 409);
    const token = generateRuntimeClientToken();
    const [row] = await tx.insert(runtimeClientCredential).values({ id: createUuidV7(), serviceClientId: clientId,
      tokenPrefix: parseRuntimeClientToken(token)!.tokenPrefix, tokenHash: hashRuntimeClientToken(token),
      label: data.label, scopes: data.scopes, expiresAt, createdByUserId: actor.userId }).returning();
    await writeRuntimeAudit(tx, actor, { serviceClientId: clientId, action: 'credential.issued', after: { credentialId: row!.id, scopes: data.scopes, expiresAt: data.expiresAt } });
    return { credential: toRuntimeCredential(row!), token };
  });
}
export async function revokeRuntimeCredential(actor: RuntimeSessionActor, clientId: string, credentialId: string) {
  return getDb().transaction(async (tx) => {
    await requireRuntimeClient(actor, clientId, tx);
    const [existing] = await tx.select().from(runtimeClientCredential).where(and(eq(runtimeClientCredential.id, credentialId), eq(runtimeClientCredential.serviceClientId, clientId))).for('update').limit(1);
    if (!existing) throw new RuntimeV2Error('credential_not_found', 'Credential was not found.', 404);
    if (existing.revokedAt) return toRuntimeCredential(existing);
    const [row] = await tx.update(runtimeClientCredential).set({ revokedAt: new Date() }).where(eq(runtimeClientCredential.id, credentialId)).returning();
    await writeRuntimeAudit(tx, actor, { serviceClientId: clientId, action: 'credential.revoked', after: { credentialId } });
    return toRuntimeCredential(row!);
  });
}
