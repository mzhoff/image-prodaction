import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { membership } from '@/shared/db/schema/workspace';
import { runtimeClientCredential, runtimeGrantAudit, runtimeServiceClient } from '../adapters/postgres/runtime-schema';
import type { RuntimeV2Scope } from '../contracts/runtime-v2-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { assertRuntimeCredentialActive, parseRuntimeClientToken, requireRuntimeScope, runtimeClientTokenMatches } from '../core/runtime-v2-credentials';
import { createUuidV7 } from '@/shared/lib/id';

export type RuntimeDatabase = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;
export type RuntimeClientIdentity = {
  kind: 'client'; serviceClientId: string; credentialId: string; workspaceId: string;
  sourceApplication: string; scopes: RuntimeV2Scope[];
};
export type RuntimeSessionActor = { kind: 'session'; userId: string; workspaceId: string };
export type RuntimeManagementActor = RuntimeSessionActor | RuntimeClientIdentity;

export async function authenticateRuntimeClientRequest(request: Request, requiredScope?: RuntimeV2Scope, database?: RuntimeDatabase): Promise<RuntimeClientIdentity> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization')?.trim() ?? '')?.[1];
  const parsed = token ? parseRuntimeClientToken(token) : null;
  if (!token || !parsed) throw new RuntimeV2Error('invalid_credential', 'A valid runtime credential is required.', 401);
  const db = database ?? getDb();
  const [hint] = await db.select().from(runtimeClientCredential).where(eq(runtimeClientCredential.tokenPrefix, parsed.tokenPrefix)).limit(1);
  if (!hint || !runtimeClientTokenMatches(token, hint.tokenHash)) throw new RuntimeV2Error('invalid_credential', 'A valid runtime credential is required.', 401);
  // All mutation/auth paths lock client before credential/grant, preventing lock-order deadlocks.
  const [client] = await db.select().from(runtimeServiceClient).where(eq(runtimeServiceClient.id, hint.serviceClientId)).for('update').limit(1);
  const [credential] = await db.select().from(runtimeClientCredential).where(eq(runtimeClientCredential.id, hint.id)).for('update').limit(1);
  if (!client || !credential) throw new RuntimeV2Error('invalid_credential', 'A valid runtime credential is required.', 401);
  assertRuntimeCredentialActive({ enabled: client.enabled, revokedAt: credential.revokedAt, expiresAt: credential.expiresAt });
  const scopes = client.scopes.filter((scope) => credential.scopes === null || credential.scopes.includes(scope));
  if (requiredScope) requireRuntimeScope(scopes, requiredScope);
  await db.update(runtimeClientCredential).set({ lastUsedAt: new Date() }).where(eq(runtimeClientCredential.id, credential.id));
  return { kind: 'client', serviceClientId: client.id, credentialId: credential.id, workspaceId: client.workspaceId, sourceApplication: client.sourceApplication, scopes };
}

export async function requireRuntimeAdmin(actor: RuntimeSessionActor, db: RuntimeDatabase = getDb()) {
  const [row] = await db.select().from(membership).where(and(eq(membership.workspaceId, actor.workspaceId), eq(membership.userId, actor.userId))).for('share').limit(1);
  if (!row || !['owner', 'admin'].includes(row.role)) throw new RuntimeV2Error('missing_scope', 'Workspace administrator access is required.', 403);
}
export async function requireRuntimeClient(actor: RuntimeManagementActor, clientId: string, db: RuntimeDatabase = getDb(), manage = false) {
  if (actor.kind === 'session') await requireRuntimeAdmin(actor, db);
  else {
    if (actor.serviceClientId !== clientId) throw new RuntimeV2Error('service_client_not_found', 'Connection was not found.', 404);
  }
  const [client] = await db.select().from(runtimeServiceClient).where(and(eq(runtimeServiceClient.id, clientId), eq(runtimeServiceClient.workspaceId, actor.workspaceId))).for('update').limit(1);
  if (!client) throw new RuntimeV2Error('service_client_not_found', 'Connection was not found.', 404);
  if (actor.kind === 'client') {
    const [credential] = await db.select().from(runtimeClientCredential).where(and(eq(runtimeClientCredential.id, actor.credentialId), eq(runtimeClientCredential.serviceClientId, clientId))).for('update').limit(1);
    if (!credential) throw new RuntimeV2Error('invalid_credential', 'A valid runtime credential is required.', 401);
    assertRuntimeCredentialActive({ enabled: client.enabled, revokedAt: credential.revokedAt, expiresAt: credential.expiresAt });
    if (manage) {
      if (client.grantManagementPolicy !== 'EXPLICIT_SCOPE') throw new RuntimeV2Error('missing_scope', 'Grant management is not enabled for this connection.', 403);
      requireRuntimeScope(client.scopes.filter((scope) => credential.scopes === null || credential.scopes.includes(scope)), 'pipeline.grants.manage');
    }
  }
  return client;
}
export async function writeRuntimeAudit(db: RuntimeDatabase, actor: RuntimeManagementActor, input: {
  serviceClientId: string; grantId?: string; action: string; before?: Record<string, unknown>; after?: Record<string, unknown>;
}) {
  await db.insert(runtimeGrantAudit).values({ id: createUuidV7(), ...input, actorType: actor.kind, actorId: actor.kind === 'session' ? actor.userId : actor.credentialId });
}
