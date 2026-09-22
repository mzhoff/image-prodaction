import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { storyProject } from '@/shared/db/schema/story-project';
import { membership } from '@/shared/db/schema/workspace';
import { asset } from '@/shared/db/schema/asset';
import { WorkspaceAccessError } from '@/entities/workspace/server/workspace-service';
import { studioFolder } from '@/shared/db/schema/studio-folder';
import { subjectProfile } from '@/shared/db/schema/subject-profile';
import { createUuidV7 } from '@/shared/lib/id';
import { storyAssetRequirements } from '../core/story-editing';
import type { StoryProject, StorySnapshot, StoryWrite } from '../contracts/story-project';

export class StoryError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) { super(message); this.name = 'StoryError'; this.status = status; this.code = code; }
}
const summaryColumns = { id: storyProject.id, workspaceId: storyProject.workspaceId, folderId: storyProject.folderId,
  name: storyProject.name, revision: storyProject.revision, createdAt: storyProject.createdAt, updatedAt: storyProject.updatedAt };
function access(userId: string) { return and(eq(membership.workspaceId, storyProject.workspaceId), eq(membership.userId, userId)); }
function dto<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
export type StoryDatabase = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;
export async function assertWorkspace(userId: string, workspaceId: string, db: StoryDatabase) {
  const [member] = await db.select({ userId: membership.userId }).from(membership)
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, userId))).limit(1);
  if (!member) throw new WorkspaceAccessError();
}
export async function listStories(userId: string, workspaceId: string, db: StoryDatabase = getDb()) {
  await assertWorkspace(userId, workspaceId, db);
  const rows = await db.select(summaryColumns).from(storyProject).innerJoin(membership, access(userId))
    .where(eq(storyProject.workspaceId, workspaceId)).orderBy(desc(storyProject.updatedAt));
  return rows.map(dto);
}
export async function getStory(userId: string, storyId: string, db: StoryDatabase = getDb()): Promise<StoryProject> {
  const [row] = await db.select({ ...summaryColumns, snapshot: storyProject.snapshot }).from(storyProject)
    .innerJoin(membership, access(userId)).where(eq(storyProject.id, storyId)).limit(1);
  if (!row) throw new StoryError('История не найдена или доступ закрыт.', 404, 'story_not_found');
  return dto(row);
}
export async function createStory(userId: string, workspaceId: string, input: StoryWrite, db: StoryDatabase = getDb(), creationId?: string) {
  await assertWorkspace(userId, workspaceId, db);
  await validateReferences(workspaceId, input, db);
  if (creationId) {
    const [created] = await db.insert(storyProject).values({ ...input, id: creationId, workspaceId, createdByUserId: userId }).onConflictDoNothing().returning();
    if (created) return dto(created);
    const [existing] = await db.select().from(storyProject).where(and(eq(storyProject.id, creationId), eq(storyProject.workspaceId, workspaceId), eq(storyProject.createdByUserId, userId))).limit(1);
    if (!existing) throw new StoryError('Не удалось восстановить создание. Вернитесь на Home и начните заново.', 409, 'creation_conflict');
    return dto(existing);
  }
  const [row] = await db.insert(storyProject).values({ ...input, id: createUuidV7(), workspaceId, createdByUserId: userId }).returning();
  return dto(row);
}
export async function saveStory(userId: string, storyId: string, expectedRevision: number, input: StoryWrite, db: StoryDatabase = getDb()) {
  const current = await getStory(userId, storyId, db);
  await validateReferences(current.workspaceId, input, db);
  const [row] = await db.update(storyProject).set({ ...input, revision: sql`${storyProject.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(storyProject.id, storyId), eq(storyProject.revision, expectedRevision),
      sql`exists (select 1 from ${membership} where ${membership.workspaceId} = ${storyProject.workspaceId} and ${membership.userId} = ${userId})`)).returning();
  if (!row) throw new StoryError('История изменена в другой вкладке или доступ закрыт. Скачайте свои правки и откройте актуальную версию.', 409, 'revision_conflict');
  return dto(row);
}
export async function validateReferences(workspaceId: string, input: StoryWrite, db: StoryDatabase) {
  if (input.snapshot.subjectIds?.length) {
    const profiles = await db.select({ id: subjectProfile.id }).from(subjectProfile)
      .where(and(eq(subjectProfile.workspaceId, workspaceId), inArray(subjectProfile.id, input.snapshot.subjectIds)));
    if (profiles.length !== input.snapshot.subjectIds.length) throw new StoryError('Герой недоступен в этом Workspace.', 422, 'invalid_story_subject');
  }
  if (input.folderId) {
    const [folder] = await db.select({ id: studioFolder.id }).from(studioFolder)
      .where(and(eq(studioFolder.workspaceId, workspaceId), eq(studioFolder.id, input.folderId))).limit(1);
    if (!folder) throw new WorkspaceAccessError('Project folder unavailable in this workspace.');
  }
  const requirements = storyAssetRequirements(input.snapshot);
  if (!requirements.length) return;
  const rows = await db.select({ id: asset.id, kind: asset.mediaKind, metadata: asset.metadata }).from(asset)
    .where(and(eq(asset.workspaceId, workspaceId), eq(asset.status, 'ready'), inArray(asset.id, [...new Set(requirements.map((item) => item.id))])));
  assertStoryAssets(input.snapshot, rows);
}
export function assertStoryAssets(snapshot: StorySnapshot, assets: { id: string; kind: string; metadata: Record<string, unknown> | null }[]) {
  assertAssetRequirements(storyAssetRequirements(snapshot), assets);
}
export function assertAssetRequirements(requirements: { id: string; kind: string; endMs?: number; allowSilentTail?: boolean }[], assets: { id: string; kind: string; metadata: Record<string, unknown> | null }[]) {
  const byId = new Map(assets.map((item) => [item.id, item]));
  for (const requirement of requirements) {
    const source = byId.get(requirement.id);
    if (!source || source.kind !== requirement.kind) throw new StoryError('Материал недоступен в этом Workspace. Замените или отвяжите его.', 422, 'invalid_story_asset');
    if (requirement.endMs !== undefined) {
      const video = source.metadata?.[requirement.kind === 'audio' ? 'audio' : 'video'] as { durationSeconds?: unknown } | undefined;
      if (typeof video?.durationSeconds !== 'number' || (!(requirement.kind === 'audio' && requirement.allowSilentTail) && requirement.endMs > Math.floor(video.durationSeconds * 1000))) {
        throw new StoryError('Диапазон клипа выходит за длительность исходного файла.', 422, 'invalid_clip_range');
      }
    }
  }
}
