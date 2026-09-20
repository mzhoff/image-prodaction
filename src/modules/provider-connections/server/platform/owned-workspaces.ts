import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';

/** Service-authenticated lookup. Browser/Telegram input never asserts ownership. */
export async function ownedBudgetWorkspaces(issuer: string, subject: string) {
  return getDb()
    .select({ id: workspace.id, name: workspace.name })
    .from(user)
    .innerJoin(membership, and(eq(membership.userId, user.id), eq(membership.role, 'owner')))
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(eq(user.identitySubject, `${issuer}#${subject}`));
}
