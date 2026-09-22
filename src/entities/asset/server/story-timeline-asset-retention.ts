import { sql } from 'drizzle-orm';
import { asset } from '@/shared/db/schema/asset';

/** Documents and durable montage results retain their media within the same Workspace. */
export function excludeStoryTimelineAssets() {
  return sql`not (${asset.status} = 'ready' and (
    exists (select 1 from story_timeline as timeline
      where timeline.workspace_id = ${asset.workspaceId} and (
        timeline.snapshot->'clips' @> jsonb_build_array(jsonb_build_object('assetId', ${asset.id}::text))
        or timeline.snapshot->'audioClips' @> jsonb_build_array(jsonb_build_object('assetId', ${asset.id}::text))
        or timeline.snapshot->'production'->'sourceAssetIds' @> jsonb_build_array(${asset.id}::text)
      ))
    or exists (select 1 from generation_job as montage_job
      where montage_job.workspace_id = ${asset.workspaceId}
        and montage_job.operation in ('montage_analyze', 'montage_plan', 'montage_render')
        and montage_job.status not in ('failed', 'canceled')
        and montage_job.metadata->'assetChecksums'->>${asset.id}::text = ${asset.checksumSha256})
  ))`;
}
