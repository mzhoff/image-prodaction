import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { homeChatGeneration, type HomeGenerationRecord } from './home-chat-schema';
import { generationJob } from '@/shared/db/schema/generation';
import { getGenerationJob } from '@/entities/generation/server/generation-orchestrator';

export interface HomeGenerationRepository {
  find(conversationId: string, sourceTurnId: string): Promise<HomeGenerationRecord | undefined>;
  byId(id: string): Promise<HomeGenerationRecord | undefined>;
  create(input: HomeGenerationRecord): Promise<HomeGenerationRecord>;
  bindJob(id: string, jobId: string): Promise<void>;
}
export const homeGenerationRepository: HomeGenerationRepository = {
  async find(conversationId, sourceTurnId) {
    const [row] = await getDb().select().from(homeChatGeneration).where(and(
      eq(homeChatGeneration.conversationId, conversationId), eq(homeChatGeneration.sourceTurnId, sourceTurnId),
    )).limit(1);
    return row;
  },
  async byId(id) {
    const [row] = await getDb().select().from(homeChatGeneration).where(eq(homeChatGeneration.id, id)).limit(1);
    return row;
  },
  async create(input) {
    await getDb().insert(homeChatGeneration).values(input).onConflictDoNothing();
    const row = await this.find(input.conversationId, input.sourceTurnId);
    if (!row) throw new Error('Не удалось сохранить запрос генерации. Повторите сообщение.');
    return row;
  },
  async bindJob(id, jobId) {
    await getDb().update(homeChatGeneration).set({ jobId }).where(eq(homeChatGeneration.id, id));
  },
};

export async function findHomeGenerationJob(record: HomeGenerationRecord) {
  const [row] = await getDb().select({ id: generationJob.id }).from(generationJob).where(and(
    eq(generationJob.workspaceId, record.workspaceId), eq(generationJob.createdByUserId, record.userId),
    eq(generationJob.idempotencyKey, `home-image:${record.id}`),
  )).limit(1);
  return row ? getGenerationJob(record.userId, row.id) : undefined;
}
