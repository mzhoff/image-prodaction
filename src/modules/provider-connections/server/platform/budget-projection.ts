import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { getCoordinationPool } from '@/shared/db/coordination-pool';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { findProviderConnection } from '../../adapters/postgres/provider-connection-repository';
import { connectOpenRouterProvider, resolveOpenRouterCredential } from '../provider-connection-service';

export async function projectBudgetConnection(input: { issuer: string; subject: string; workspaceId: string; apiKey: string; keyHash: string }) {
  const [owner] = await getDb().select({ account: user, workspace }).from(workspace)
    .innerJoin(membership, and(eq(membership.workspaceId, workspace.id), eq(membership.role, 'owner')))
    .innerJoin(user, eq(user.id, membership.userId)).where(eq(workspace.id, input.workspaceId)).limit(1);
  if (!owner) return { status: 409, code: 'WORKSPACE_OWNER_REQUIRED' };
  const account = owner.account;
  const targetWorkspace = owner.workspace;
  const lock = await getCoordinationPool().connect();
  try {
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [`budget-projection:${targetWorkspace.id}`]);
    const existing = await findProviderConnection(targetWorkspace.id, 'openrouter');
    const managed = existing?.providerMetadata?.platformManagedKeyHash;
    if (existing?.encryptedSecret && !managed) return { status: 409, code: 'EXISTING_CREDENTIAL_REQUIRES_MIGRATION' };
    if (managed && managed !== input.keyHash) return { status: 409, code: 'MANAGED_KEY_CONFLICT' };
    if (existing?.status === 'connected' && existing.encryptedSecret) {
      const credential = await resolveOpenRouterCredential(account.id, targetWorkspace.id);
      if (digest(credential.apiKey) === digest(input.apiKey) && managed === input.keyHash) return { status: 200, workspaceId: targetWorkspace.id };
    }
    const result = await connectOpenRouterProvider({ apiKey: input.apiKey, userId: account.id, workspaceId: targetWorkspace.id, managedKeyHash: input.keyHash });
    return { status: 200, workspaceId: targetWorkspace.id, connected: result.provider.status === 'connected' };
  } finally {
    let reusable = true;
    await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`budget-projection:${targetWorkspace.id}`]).catch(() => { reusable = false; });
    lock.release(!reusable);
  }
}
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
