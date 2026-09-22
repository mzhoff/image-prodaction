import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { storyTimeline } from '@/shared/db/schema/story-timeline';
import { studioFolder } from '@/shared/db/schema/studio-folder';
import { membership } from '@/shared/db/schema/workspace';
import { asset } from '@/shared/db/schema/asset';
import { createUuidV7 } from '@/shared/lib/id';
import { timelineWriteSchema, type TimelineDocument, type TimelineWrite } from '../contracts/story-timeline';
import { timelineAssetRequirements, mergeTimelineWrite } from '../core/timeline-media';
import { assertAssetRequirements, assertWorkspace, getStory, StoryError, type StoryDatabase } from './story-service';

function access(userId: string) { return and(eq(membership.workspaceId, storyTimeline.workspaceId), eq(membership.userId, userId)); }
const columns = { id: storyTimeline.id, workspaceId: storyTimeline.workspaceId, folderId: storyTimeline.folderId,
  storyboardId: storyTimeline.storyboardId, name: storyTimeline.name, revision: storyTimeline.revision,
  createdAt: storyTimeline.createdAt, updatedAt: storyTimeline.updatedAt };
function dto<T extends { createdAt: Date; updatedAt: Date }>(row: T) { return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
export async function listTimelines(userId: string, workspaceId: string, db: StoryDatabase = getDb()) {
  await assertWorkspace(userId, workspaceId, db);
  return (await db.select(columns).from(storyTimeline).innerJoin(membership, access(userId))
    .where(eq(storyTimeline.workspaceId, workspaceId)).orderBy(desc(storyTimeline.updatedAt))).map(dto);
}
export async function getTimeline(userId: string, id: string, db: StoryDatabase = getDb()): Promise<TimelineDocument> {
  const [row] = await db.select({ ...columns, snapshot: storyTimeline.snapshot }).from(storyTimeline)
    .innerJoin(membership, access(userId)).where(eq(storyTimeline.id, id)).limit(1);
  if (!row) throw new StoryError('Монтаж не найден или доступ закрыт.', 404, 'timeline_not_found');
  return dto(row);
}
export async function createTimeline(userId: string, workspaceId: string, input: TimelineWrite, db: StoryDatabase = getDb(), creationId?: string) {
  input = timelineWriteSchema.parse(input);
  await assertWorkspace(userId, workspaceId, db); await validate(userId, workspaceId, input, db);
  if (creationId) {
    const [created] = await db.insert(storyTimeline).values({ ...input, id: creationId, workspaceId, createdByUserId: userId }).onConflictDoNothing().returning();
    if (created) return dto(created);
    const [existing] = await db.select().from(storyTimeline).where(and(eq(storyTimeline.id, creationId), eq(storyTimeline.workspaceId, workspaceId), eq(storyTimeline.createdByUserId, userId))).limit(1);
    if (!existing) throw new StoryError('Не удалось восстановить создание. Вернитесь на Home и начните заново.', 409, 'creation_conflict');
    return dto(existing);
  }
  const [row] = await db.insert(storyTimeline).values({ ...input, id: createUuidV7(), workspaceId, createdByUserId: userId }).returning();
  return dto(row);
}
export async function saveTimeline(userId: string, id: string, revision: number, input: TimelineWrite, db: StoryDatabase = getDb()) {
  const current = await getTimeline(userId, id, db);
  input = timelineWriteSchema.parse({ ...input, snapshot: mergeTimelineWrite(current.snapshot, input.snapshot) });
  await validate(userId, current.workspaceId, input, db);
  const snapshot = current.storyboardId === input.storyboardId ? input.snapshot
    : { ...input.snapshot, clips: input.snapshot.clips.map((clip) => ({ ...clip, shotId: null })) };
  const [row] = await db.update(storyTimeline).set({ ...input, snapshot, revision: sql`${storyTimeline.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(storyTimeline.id, id), eq(storyTimeline.revision, revision),
      sql`exists (select 1 from ${membership} where ${membership.workspaceId} = ${storyTimeline.workspaceId} and ${membership.userId} = ${userId})`)).returning();
  if (!row) throw new StoryError('Монтаж изменён в другой вкладке. Скачайте свои правки и откройте актуальную версию.', 409, 'revision_conflict');
  return dto(row);
}
async function validate(userId: string, workspaceId: string, input: TimelineWrite, db: StoryDatabase) {
  if (input.storyboardId && (await getStory(userId, input.storyboardId, db)).workspaceId !== workspaceId) throw new StoryError('Раскадровка недоступна в этом Workspace.', 422, 'invalid_storyboard');
  if (input.folderId) {
    const [folder] = await db.select({ id: studioFolder.id }).from(studioFolder).where(and(eq(studioFolder.id, input.folderId), eq(studioFolder.workspaceId, workspaceId))).limit(1);
    if (!folder) throw new StoryError('Папка недоступна в этом Workspace.', 422, 'invalid_folder');
  }
  const requirements = timelineAssetRequirements(input.snapshot); if (!requirements.length) return;
  const assets = await db.select({ id: asset.id, kind: asset.mediaKind, metadata: asset.metadata }).from(asset)
    .where(and(eq(asset.workspaceId, workspaceId), eq(asset.status, 'ready'), inArray(asset.id, [...new Set(requirements.map((item) => item.id))])));
  assertAssetRequirements(requirements, assets);
}
