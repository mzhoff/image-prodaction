import { and, eq, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { asset } from '@/shared/db/schema/asset';
import { document } from '@/shared/db/schema/document';
import { generationJob } from '@/shared/db/schema/generation';

export function projectMediaConditions(input: {
  workspaceId: string; folderId: string; storyAssetIds: string[];
  search?: string; cursor?: { createdAt: Date; id: string };
}) {
  const flowRelation = sql`exists (select 1 from ${document} where ${document.id} = ${asset.documentId}
    and ${document.workspaceId} = ${input.workspaceId} and ${document.folderId} = ${input.folderId}
    and ${document.status} = 'active')`;
  const chatRelation = sql`exists (select 1 from home_chat_generation hg join production_chat pc on pc.conversation_id = hg.conversation_id
    where hg.job_id = ${asset.generationJobId} and hg.workspace_id = ${input.workspaceId}::uuid and pc.folder_id = ${input.folderId}::uuid)`;
  const chatVideoRelation = sql`exists (select 1 from ${generationJob} join production_chat pc
    on pc.conversation_id = ${generationJob.metadata}->>'conversationId'
    where ${generationJob.id} = ${asset.generationJobId} and ${generationJob.workspaceId} = ${input.workspaceId}::uuid
      and ${generationJob.operation} = 'generate_video' and ${generationJob.metadata}->>'source' = 'home-chat'
      and pc.folder_id = ${input.folderId}::uuid)`;
  const relation = or(flowRelation, chatRelation, chatVideoRelation, input.storyAssetIds.length ? inArray(asset.id, input.storyAssetIds) : undefined)!;
  const conditions: SQL[] = [eq(asset.workspaceId, input.workspaceId), eq(asset.status, 'ready'),
    eq(asset.libraryVisible, true), relation];
  if (input.search) conditions.push(ilike(asset.originalName, `%${input.search}%`));
  if (input.cursor) conditions.push(or(lt(asset.createdAt, input.cursor.createdAt),
    and(eq(asset.createdAt, input.cursor.createdAt), lt(asset.id, input.cursor.id)))!);
  return conditions;
}
