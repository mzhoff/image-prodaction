import { eq, sql } from 'drizzle-orm';
import { storyTimeline } from '@/shared/db/schema/story-timeline';
import { z } from 'zod';
import { getDb } from '@/shared/db/client';
import { studioFolder } from '@/shared/db/schema/studio-folder';
import { createUuidV7 } from '@/shared/lib/id';
import { timelineSnapshotSchema } from '../contracts/story-timeline';
import { exportTimelineOtio, importTimelineOtio } from '../core/timeline-otio';
import { createTimeline, getTimeline, saveTimeline } from './timeline-service';
import { assertWorkspace, StoryError } from './story-service';

export const createTimelineProductionSchema = z.object({
  creationId: z.uuid().optional(), storyboardId: z.uuid().nullable().optional(), workspaceId: z.uuid(), name: z.string().trim().min(1).max(120), snapshot: timelineSnapshotSchema,
  project: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('existing'), folderId: z.uuid() }).strict(),
    z.object({ mode: z.literal('new'), name: z.string().trim().min(1).max(120) }).strict(),
  ]),
}).strict();
export async function createTimelineProduction(userId: string, value: unknown, db: Pick<ReturnType<typeof getDb>, 'transaction'> = getDb()) {
  const input = createTimelineProductionSchema.parse(value);
  return db.transaction(async (tx) => {
    await assertWorkspace(userId, input.workspaceId, tx);
    if (input.creationId) {
      // Serialize retries before creating the project, so one logical creation has one folder.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.creationId}, 0))`);
      const [existing] = await tx.select().from(storyTimeline).where(eq(storyTimeline.id, input.creationId)).limit(1);
      if (existing) {
        if (existing.workspaceId !== input.workspaceId || existing.createdByUserId !== userId) throw new StoryError('Не удалось восстановить создание.', 409, 'creation_conflict');
        return { timeline: await getTimeline(userId, existing.id, tx), folderId: existing.folderId };
      }
    }
    let folderId: string;
    if (input.project.mode === 'new') {
      folderId = createUuidV7();
      await tx.insert(studioFolder).values({ id: folderId, workspaceId: input.workspaceId, createdByUserId: userId, name: input.project.name });
    } else folderId = input.project.folderId;
    // Asset validation and folder creation share a transaction: invalid media leaves no empty project.
    const timeline = await createTimeline(userId, input.workspaceId, { name: input.name, folderId, storyboardId: input.storyboardId ?? null, snapshot: input.snapshot }, tx, input.creationId);
    return { timeline, folderId };
  });
}
const bindingSchema = z.object({ assetId: z.uuid(), kind: z.enum(['image', 'video', 'audio']) }).strict();
export const importOtioSchema = z.object({ expectedRevision: z.number().int().min(0), document: z.unknown(),
  bindings: z.record(z.string().max(2048), bindingSchema).refine((v) => Object.keys(v).length <= 532),
}).strict();
export async function importTimelineDocument(userId: string, id: string, value: unknown) {
  const body = importOtioSchema.parse(value), current = await getTimeline(userId, id);
  if (current.revision !== body.expectedRevision) throw new StoryError('Монтаж изменился.', 409, 'revision_conflict');
  let snapshot;
  try { snapshot = importTimelineOtio(body.document, body.bindings, createUuidV7); }
  catch { throw new StoryError('OTIO не поддерживается или исходники не сопоставлены. Поддержаны склейки, до 16 видеодорожек и отдельное аудио.', 422, 'unsupported_otio'); }
  return saveTimeline(userId, id, body.expectedRevision, { name: current.name, folderId: current.folderId, storyboardId: null, snapshot });
}
export async function exportTimelineDocument(userId: string, id: string) {
  const timeline = await getTimeline(userId, id);
  return exportTimelineOtio(timeline.name, timeline.snapshot);
}
