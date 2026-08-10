// Retry-safe bridge from authentication lifecycle to the Workspace domain.
import { ensurePersonalWorkspace } from '@/entities/workspace/server/workspace-service';
import type { PersonalWorkspaceUser } from '@/shared/auth/personal-workspace-user';

export type { PersonalWorkspaceUser } from '@/shared/auth/personal-workspace-user';

type BootstrapPersonalWorkspace = (user: PersonalWorkspaceUser) => Promise<unknown>;
type ReportBootstrapFailure = (userId: string) => void;

const bootstrapPromises = new Map<string, Promise<boolean>>();

export async function ensurePersonalWorkspaceForUser(user: PersonalWorkspaceUser) {
  const existing = bootstrapPromises.get(user.id);
  if (existing) return existing;

  const pending = attemptPersonalWorkspaceBootstrap(user);
  bootstrapPromises.set(user.id, pending);
  if (bootstrapPromises.size > 10_000) {
    const oldestUserId = bootstrapPromises.keys().next().value;
    if (oldestUserId && oldestUserId !== user.id) bootstrapPromises.delete(oldestUserId);
  }

  if (!await pending) bootstrapPromises.delete(user.id);
  return pending;
}

export async function attemptPersonalWorkspaceBootstrap(
  user: PersonalWorkspaceUser,
  bootstrap: BootstrapPersonalWorkspace = ensurePersonalWorkspace,
  reportFailure: ReportBootstrapFailure = reportBootstrapFailure,
) {
  try {
    await bootstrap(user);
    return true;
  } catch {
    reportFailure(user.id);
    return false;
  }
}

function reportBootstrapFailure(userId: string) {
  console.error('[auth] Personal workspace bootstrap failed; it will be retried.', { userId });
}
