import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { workspaceProviderConnection, workspaceProviderCredential } from '@/shared/db/schema/provider';
import { resolveOpenRouterCredential } from '../provider-connection-service';
import { createRuntimeOpenRouterAdapter } from '../runtime-provider-adapter';

export interface BudgetWorkspaceRecord {
  userId: string;
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  status: 'connected' | 'invalid' | 'disconnected' | null;
  credentialId: string | null;
}
export interface WorkspaceBudgetSummary {
  id: string;
  name: string;
  role: BudgetWorkspaceRecord['role'];
  connectionStatus: 'missing' | 'ready' | 'unavailable' | 'disabled' | 'pending';
  balanceUSD: number | null;
  balanceCheckedAt: string | null;
}
interface Dependencies {
  list(issuer: string, subject: string): Promise<BudgetWorkspaceRecord[]>;
  balance(record: BudgetWorkspaceRecord, signal: AbortSignal): Promise<string | null>;
  now(): Date;
}

/** Select only actual memberships. Credentials and provider metadata never leave the service. */
export async function listBudgetMemberships(
  issuer: string,
  subject: string,
  database: Pick<ReturnType<typeof getDb>, 'select'> = getDb(),
) {
  const rows = await database.select({
    userId: user.id, id: workspace.id, name: workspace.name, role: membership.role,
    status: workspaceProviderConnection.status, credentialId: workspaceProviderCredential.id,
  }).from(user)
    .innerJoin(membership, eq(membership.userId, user.id))
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .leftJoin(workspaceProviderConnection, and(
      eq(workspaceProviderConnection.workspaceId, workspace.id),
      eq(workspaceProviderConnection.provider, 'openrouter'),
    ))
    .leftJoin(workspaceProviderCredential, and(
      eq(workspaceProviderCredential.connectionId, workspaceProviderConnection.id),
      isNull(workspaceProviderCredential.revokedAt),
    ))
    .where(eq(user.identitySubject, `${issuer}#${subject}`)).limit(101);
  if (rows.length > 100) throw new Error('workspace_summary_limit');
  return rows;
}

async function readBalance(record: BudgetWorkspaceRecord, signal: AbortSignal) {
  if (signal.aborted) throw signal.reason;
  // Recheck membership before decrypting; use the existing provider gateway.
  const { apiKey } = await resolveOpenRouterCredential(record.userId, record.id);
  if (signal.aborted) throw signal.reason;
  const summary = await createRuntimeOpenRouterAdapter().getCredentialSummary({ credential: apiKey, signal });
  return summary.limitRemainingUsd;
}

export async function summarizeBudgetWorkspaces(
  issuer: string,
  subject: string,
  signal: AbortSignal,
  dependencies: Dependencies = { list: listBudgetMemberships, balance: readBalance, now: () => new Date() },
): Promise<WorkspaceBudgetSummary[]> {
  const records = await dependencies.list(issuer, subject);
  const results: WorkspaceBudgetSummary[] = [];
  let next = 0;
  async function worker() {
    while (next < records.length) {
      const index = next++, record = records[index];
      const result: WorkspaceBudgetSummary = {
        id: record.id, name: record.name, role: record.role,
        connectionStatus: 'missing', balanceUSD: null, balanceCheckedAt: null,
      };
      results[index] = result;
      if (!record.status) continue;
      if (record.status !== 'connected') { result.connectionStatus = 'disabled'; continue; }
      if (!record.credentialId) continue;
      result.connectionStatus = 'unavailable';
      if (signal.aborted) continue;
      try {
        const balance = await dependencies.balance(record, signal);
        result.connectionStatus = 'ready';
        const parsed = balance === null || balance.trim() === '' ? NaN : Number(balance);
        result.balanceUSD = Number.isFinite(parsed) ? parsed : null;
        result.balanceCheckedAt = dependencies.now().toISOString();
      } catch { /* Unknown remains unknown; never substitute historic grants or a zero. */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, records.length) }, worker));
  return results;
}
