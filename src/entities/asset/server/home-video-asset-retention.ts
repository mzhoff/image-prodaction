import { sql } from 'drizzle-orm';
import { asset } from '@/shared/db/schema/asset';

/** A private Home reference is retained with its conversation, including after
 * the video finishes, because the original user message still displays it. */
export function excludeHomeVideoReferenceAssets() {
  return sql`not (${asset.status} = 'ready' and exists (
    select 1 from generation_job as home_video_job
    join home_chat_conversation as home_video_conversation
      on home_video_conversation.conversation_id = home_video_job.metadata->>'conversationId'
      and home_video_conversation.workspace_id = home_video_job.workspace_id
      and home_video_conversation.user_id = home_video_job.created_by_user_id
    where home_video_job.workspace_id = ${asset.workspaceId}
      and home_video_job.operation = 'generate_video'
      and home_video_job.metadata->>'source' = 'home-chat'
      and (
        home_video_job.metadata->'videoRequest'->'firstFrame'->>'assetId' = ${asset.id}::text
        or home_video_job.metadata->'videoRequest'->'lastFrame'->>'assetId' = ${asset.id}::text
        or home_video_job.metadata->'videoRequest'->'references'
          @> jsonb_build_array(jsonb_build_object('assetId', ${asset.id}::text))
      )
  ))`;
}
