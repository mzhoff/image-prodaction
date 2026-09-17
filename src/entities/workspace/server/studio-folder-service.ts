import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { studioFolder } from '@/shared/db/schema/studio-folder';
import { document } from '@/shared/db/schema/document';
import { createUuidV7 } from '@/shared/lib/id';
import { requireWorkspaceMembership, WorkspaceAccessError } from './workspace-service';

export async function listStudioFolders(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);
  return getDb().select().from(studioFolder).where(eq(studioFolder.workspaceId, workspaceId))
    .orderBy(desc(studioFolder.updatedAt));
}

export async function requireStudioFolder(userId: string, workspaceId: string, id: string) {
  await requireWorkspaceMembership(userId, workspaceId);
  const [folder] = await getDb().select().from(studioFolder)
    .where(and(eq(studioFolder.workspaceId, workspaceId), eq(studioFolder.id, id)));
  if (!folder) throw new WorkspaceAccessError('Project folder unavailable in this workspace.');
  return folder;
}

export async function createStudioFolder(userId: string, workspaceId: string, name: string) {
  await requireWorkspaceMembership(userId, workspaceId);
  const [folder] = await getDb().insert(studioFolder).values({ id: createUuidV7(), workspaceId, createdByUserId: userId, name }).returning();
  return folder;
}

export async function updateStudioFolder(userId: string, workspaceId: string, id: string, name: string) {
  const current = await requireStudioFolder(userId, workspaceId, id);
  if (current.systemKey) throw new WorkspaceAccessError('System integration projects cannot be renamed.');
  const [folder] = await getDb().update(studioFolder).set({ name })
    .where(and(eq(studioFolder.workspaceId, workspaceId), eq(studioFolder.id, id))).returning();
  return folder;
}

export async function removeStudioFolder(userId: string, workspaceId: string, id: string) {
  const current = await requireStudioFolder(userId, workspaceId, id);
  if (current.systemKey) throw new WorkspaceAccessError('System integration projects cannot be removed.');
  await getDb().transaction(async (tx) => {
    // Remove organization only. Documents, snapshots, assets and pipelines survive.
    await tx.update(document).set({ folderId: null }).where(and(eq(document.workspaceId, workspaceId), eq(document.folderId, id)));
    await tx.delete(studioFolder).where(and(eq(studioFolder.workspaceId, workspaceId), eq(studioFolder.id, id)));
  });
}
