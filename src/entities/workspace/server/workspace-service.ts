import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { createUuidV7 } from '@/shared/lib/id';
import type { PersonalWorkspaceUser } from '@/shared/auth/workspace-bootstrap';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export class WorkspaceAccessError extends Error {
  constructor(message = 'Workspace access denied.') {
    super(message);
    this.name = 'WorkspaceAccessError';
  }
}

export async function ensurePersonalWorkspace(user: PersonalWorkspaceUser) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(workspace).values({
      id: createUuidV7(),
      name: getPersonalWorkspaceName(user.name),
      kind: 'personal',
      createdByUserId: user.id,
    }).onConflictDoNothing().returning();

    const personalWorkspace = created ?? await tx.query.workspace.findFirst({
      where: and(eq(workspace.createdByUserId, user.id), eq(workspace.kind, 'personal')),
    });
    if (!personalWorkspace) throw new Error('Personal workspace could not be created.');

    await tx.insert(membership).values({
      workspaceId: personalWorkspace.id,
      userId: user.id,
      role: 'owner',
    }).onConflictDoNothing();

    return personalWorkspace;
  });
}

export async function listUserWorkspaces(userId: string) {
  return getDb().select({
    id: workspace.id,
    name: workspace.name,
    kind: workspace.kind,
    role: membership.role,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }).from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(eq(membership.userId, userId));
}

export async function requireWorkspaceMembership(
  userId: string,
  workspaceId: string,
  allowedRoles: WorkspaceRole[] = ['owner', 'admin', 'member'],
) {
  const [record] = await getDb().select().from(membership).where(and(
    eq(membership.workspaceId, workspaceId),
    eq(membership.userId, userId),
  )).limit(1);

  if (!record || !allowedRoles.includes(record.role)) throw new WorkspaceAccessError();
  return record;
}

function getPersonalWorkspaceName(name: string) {
  const normalized = name.trim().slice(0, 80);
  return normalized ? `${normalized}'s Workspace` : 'Personal Workspace';
}
