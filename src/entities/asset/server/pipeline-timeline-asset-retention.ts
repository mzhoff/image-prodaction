import { and, sql } from 'drizzle-orm';
import { asset } from '@/shared/db/schema/asset';
import { excludeRetainedVideoDerivatives } from './video-asset-retention';

export function excludeRetainedAssetCandidates() {
  return and(excludeRetainedVideoDerivatives(), excludePinnedTimelineAssets());
}

/** Exact published pins protect private Timeline and Stories media from orphan cleanup.
 * Raw SQL deliberately avoids importing the runtime module into the asset entity. */
export function excludePinnedTimelineAssets() {
  return sql`not (${asset.status} = 'ready' and exists (
    select 1 from pipeline_version as timeline_version
    join executable_pipeline as timeline_pipeline on timeline_pipeline.id = timeline_version.pipeline_id
    cross join lateral jsonb_array_elements(coalesce(timeline_version.compiled_plan->'definition'->'nodes', '[]'::jsonb)) as timeline_node(value)
    where timeline_pipeline.workspace_id = ${asset.workspaceId}
      and timeline_node.value->>'handlerType' in ('timeline.handoff', 'stories.assemble')
      and timeline_node.value->'config'->'assetChecksums'->>${asset.id}::text = ${asset.checksumSha256}
  ))`;
}
