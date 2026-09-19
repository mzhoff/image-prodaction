import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { ensurePersonalWorkspace } from '@/entities/workspace/server/workspace-service';
import { findProviderConnection } from '../../adapters/postgres/provider-connection-repository';
import { connectOpenRouterProvider, resolveOpenRouterCredential } from '../provider-connection-service';

export async function projectBudgetConnection(input: { issuer: string; subject: string; apiKey: string; keyHash: string }) {
  const [account] = await getDb().select().from(user).where(eq(user.identitySubject, `${input.issuer}#${input.subject}`)).limit(1);
  if (!account) return { status: 409, code: 'PRODUCT_LOGIN_REQUIRED' };
  const workspace = await ensurePersonalWorkspace(account);
  const lock = await getPostgresPool().connect();
  try {
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [`budget-projection:${workspace.id}`]);
    const existing = await findProviderConnection(workspace.id, 'openrouter');
    const managed = existing?.providerMetadata?.platformManagedKeyHash;
    if (managed && managed !== input.keyHash) return { status: 409, code: 'MANAGED_KEY_CONFLICT' };
    if (existing?.status === 'connected' && existing.encryptedSecret) {
      const credential = await resolveOpenRouterCredential(account.id, workspace.id);
      if (digest(credential.apiKey) === digest(input.apiKey) && managed === input.keyHash) return { status: 200, workspaceId: workspace.id };
    }
    const result = await connectOpenRouterProvider({ apiKey: input.apiKey, userId: account.id, workspaceId: workspace.id, managedKeyHash: input.keyHash });
    return { status: 200, workspaceId: workspace.id, connected: result.provider.status === 'connected' };
  } finally {
    let reusable = true;
    await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`budget-projection:${workspace.id}`]).catch(() => { reusable = false; });
    lock.release(!reusable);
  }
}
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
