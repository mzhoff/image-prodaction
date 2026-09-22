import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import type { CharacterGeneration } from '../contracts/story-character';

export async function characterGenerationRows(workspaceId: string, storyId: string) {
  return getDb().select().from(generationJob).where(and(eq(generationJob.workspaceId, workspaceId),
    eq(generationJob.operation, 'generate_image'), sql`${generationJob.metadata}->>'storyId' = ${storyId}`,
    sql`${generationJob.metadata}->>'source' = 'story-character'`)).orderBy(desc(generationJob.createdAt)).limit(120);
}
export function presentCharacterGeneration(row: Awaited<ReturnType<typeof characterGenerationRows>>[number]): CharacterGeneration {
  return { id: row.id, characterId: String(row.metadata?.characterId ?? ''),
    characterRevision: Number(row.metadata?.characterRevision ?? 0), visualStyle: String(row.metadata?.visualStyle ?? ''),
    model: row.modelId, status: row.cancelRequestedAt && row.status === 'running' ? 'canceled' : row.status,
    assetId: row.finalAssetId, createdAt: row.createdAt.toISOString(),
    ...(row.status === 'failed' ? { error: 'Не удалось создать образ. Проверьте доступ к AI и попробуйте ещё раз.' } : {}),
  };
}
