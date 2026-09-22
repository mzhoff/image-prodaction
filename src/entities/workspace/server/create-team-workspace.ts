import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { workspaceCreateSchema, type WorkspaceCreateInput } from '../model/workspace-create';

export class WorkspaceCreateConflict extends Error {}

/** Workspace and its owner are committed together. The request ID makes retries safe. */
export async function createTeamWorkspace(userId: string, input: WorkspaceCreateInput, db: Pick<ReturnType<typeof getDb>, 'transaction'> = getDb()) {
  const { name, creationId } = workspaceCreateSchema.parse(input);
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(workspace).values({
      id: creationId, name, kind: 'team', createdByUserId: userId,
    }).onConflictDoNothing({ target: workspace.id }).returning({ id: workspace.id, name: workspace.name });
    if (created) {
      await tx.insert(membership).values({ workspaceId: created.id, userId, role: 'owner' });
      return created;
    }
    // A retry may reuse only the same actor's exact request, never another
    // workspace ID, and must not restore ownership revoked since creation.
    const [existing] = await tx.select({ id: workspace.id, name: workspace.name }).from(workspace)
      .innerJoin(membership, eq(membership.workspaceId, workspace.id))
      .where(and(eq(workspace.id, creationId), eq(workspace.createdByUserId, userId),
        eq(workspace.kind, 'team'), eq(workspace.name, name), eq(membership.userId, userId), eq(membership.role, 'owner'))).limit(1);
    if (!existing) throw new WorkspaceCreateConflict();
    return existing;
  });
}
