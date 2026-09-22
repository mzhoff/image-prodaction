import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { videoStylePreset } from '@/shared/db/schema/video-style-preset';
import { asset } from '@/shared/db/schema/asset';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { videoStyleSettingsSchema } from '@/shared/media/home-video-direction';
import { saveVideoStylePresetSchema, type SaveVideoStylePreset, type VideoStylePreset } from '../contracts/video-style-preset';
import { assertVideoStyleCover, VideoStylePresetError } from './video-style-preset-policy';

export async function listVideoStylePresets(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);
  const rows = await getDb().select().from(videoStylePreset).where(eq(videoStylePreset.workspaceId, workspaceId))
    .orderBy(desc(videoStylePreset.updatedAt), desc(videoStylePreset.id));
  return rows.map(toPreset);
}

export async function saveVideoStylePreset(userId: string, workspaceId: string, id: string, input: SaveVideoStylePreset) {
  await requireWorkspaceMembership(userId, workspaceId);
  const { expectedRevision, ...fields } = saveVideoStylePresetSchema.parse(input);
  return getDb().transaction(async (tx) => {
    if (fields.coverAssetId) {
      const [cover] = await tx.select({ workspaceId: asset.workspaceId, status: asset.status,
        mediaKind: asset.mediaKind, libraryVisible: asset.libraryVisible }).from(asset)
        .where(eq(asset.id, fields.coverAssetId)).limit(1).for('share');
      assertVideoStyleCover(workspaceId, cover);
    }
    let saved: typeof videoStylePreset.$inferSelect | undefined;
    if (expectedRevision === 0) {
      [saved] = await tx.insert(videoStylePreset).values({ ...fields, id, workspaceId, createdByUserId: userId })
        .onConflictDoNothing().returning();
    } else {
      [saved] = await tx.update(videoStylePreset).set({ ...fields, revision: expectedRevision + 1 })
        .where(and(eq(videoStylePreset.id, id), eq(videoStylePreset.workspaceId, workspaceId),
          eq(videoStylePreset.revision, expectedRevision))).returning();
    }
    if (!saved) throw new VideoStylePresetError('Стиль уже изменён. Обновите список и повторите — ваши правки не перезаписаны.', 409);
    return toPreset(saved);
  });
}

export async function deleteVideoStylePreset(userId: string, workspaceId: string, id: string, expectedRevision: number) {
  await requireWorkspaceMembership(userId, workspaceId);
  const [deleted] = await getDb().delete(videoStylePreset).where(and(eq(videoStylePreset.id, id),
    eq(videoStylePreset.workspaceId, workspaceId), eq(videoStylePreset.revision, expectedRevision)))
    .returning({ id: videoStylePreset.id });
  if (!deleted) throw new VideoStylePresetError('Стиль уже изменён или удалён. Обновите список перед удалением.', 409);
  // Its gallery image remains untouched, including when used by other documents/presets.
}

function toPreset(row: typeof videoStylePreset.$inferSelect): VideoStylePreset {
  return { id: row.id, workspaceId: row.workspaceId, name: row.name, style: videoStyleSettingsSchema.parse(row.style),
    coverAssetId: row.coverAssetId, revision: row.revision, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
