import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { subjectProfile } from '@/shared/db/schema/subject-profile';
import { asset } from '@/shared/db/schema/asset';
import { document } from '@/shared/db/schema/document';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { buildLibrarySubject, subjectProfileFields, type SubjectProfileFields } from '../model/subject-profile';

export class SubjectProfileError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 422) { super(message); }
}

export async function listSubjectProfiles(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);
  // The catalog does not download every long passport. Fetch the complete record only on open/load.
  const rows = await getDb().select({ id: subjectProfile.id, workspaceId: subjectProfile.workspaceId,
    name: sql<string>`${subjectProfile.payload}->>'name'`,
    identitySummary: sql<string>`left(${subjectProfile.payload}->>'identitySummary', 400)`,
    imageAssetIds: sql<string[]>`${subjectProfile.payload}->'imageAssetIds'`,
  }).from(subjectProfile).where(eq(subjectProfile.workspaceId, workspaceId))
    .orderBy(desc(subjectProfile.updatedAt), desc(subjectProfile.id));
  return rows.map((row) => ({ ...row, title: row.name }));
}

export async function getSubjectProfile(userId: string, workspaceId: string, id: string) {
  await requireWorkspaceMembership(userId, workspaceId);
  const [row] = await getDb().select().from(subjectProfile)
    .where(and(eq(subjectProfile.workspaceId, workspaceId), eq(subjectProfile.id, id)));
  if (!row) throw new SubjectProfileError('Персонаж не найден.', 404);
  return toProfile(row);
}

export async function saveSubjectProfile(input: { userId: string; workspaceId: string; id: string;
  expectedRevision: number; sourceDocumentId?: string | null; fields: SubjectProfileFields }) {
  await requireWorkspaceMembership(input.userId, input.workspaceId);
  const fields = subjectProfileFields.parse(input.fields);
  return getDb().transaction(async (tx) => {
    if (input.sourceDocumentId) {
      const [source] = await tx.select({ id: document.id }).from(document).where(and(
        eq(document.id, input.sourceDocumentId), eq(document.workspaceId, input.workspaceId), eq(document.status, 'active')));
      if (!source) throw new SubjectProfileError('Исходный канвас недоступен.', 422);
    }
    if (fields.imageAssetIds.length) {
      const images = await tx.select({ id: asset.id }).from(asset).where(and(
        inArray(asset.id, fields.imageAssetIds), eq(asset.workspaceId, input.workspaceId),
        eq(asset.status, 'ready'), eq(asset.mediaKind, 'image')));
      if (images.length !== fields.imageAssetIds.length) throw new SubjectProfileError('Один из референсов недоступен в этом Workspace.', 422);
    }
    const scope = and(eq(subjectProfile.id, input.id), eq(subjectProfile.workspaceId, input.workspaceId));
    let saved: typeof subjectProfile.$inferSelect | undefined;
    if (input.expectedRevision === 0) {
      [saved] = await tx.insert(subjectProfile).values({ id: input.id, workspaceId: input.workspaceId,
        createdByUserId: input.userId, sourceDocumentId: input.sourceDocumentId, payload: fields })
        .onConflictDoNothing().returning();
    } else {
      [saved] = await tx.update(subjectProfile).set({ payload: fields, revision: input.expectedRevision + 1 })
        .where(and(scope, eq(subjectProfile.revision, input.expectedRevision))).returning();
    }
    if (!saved) throw new SubjectProfileError('Паспорт уже изменён. Обновите его перед сохранением; ваши правки не перезаписаны.', 409);
    // Library refs must survive removal of their original canvas.
    if (fields.imageAssetIds.length) await tx.update(asset).set({ libraryVisible: true }).where(and(
      inArray(asset.id, fields.imageAssetIds), eq(asset.workspaceId, input.workspaceId), eq(asset.status, 'ready')));
    return toProfile(saved);
  });
}

function toProfile(row: typeof subjectProfile.$inferSelect) {
  return buildLibrarySubject(subjectProfileFields.parse(row.payload), { id: row.id, workspaceId: row.workspaceId,
    revision: row.revision, sourceDocumentId: row.sourceDocumentId,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
}
