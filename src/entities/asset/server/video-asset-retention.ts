import { sql } from 'drizzle-orm';
import { asset } from '@/shared/db/schema/asset';
import type { AssetRecord } from './asset-repository-contracts';

const operations = ['video_audio', 'video_video-only', 'video_preview', 'video_crop', 'video_trim', 'timeline_frame'];
/** Hidden derivatives remain usable while the exact immutable original is ready.
 * Source id and checksum are server-owned metadata; Workspace equality prevents cross-tenant pinning. */
export function excludeRetainedVideoDerivatives() {
  return sql`not (
    coalesce(${asset.operation}, '') in ('video_audio', 'video_video-only', 'video_preview', 'video_crop', 'video_trim', 'timeline_frame')
    and ${asset.status} = 'ready'
    and exists (
      select 1 from asset as video_source
      where video_source.id::text = ${asset.metadata}->>'sourceAssetId'
        and video_source.checksum_sha256 = ${asset.metadata}->>'sourceChecksumSha256'
        and video_source.workspace_id = ${asset.workspaceId}
        and video_source.status = 'ready'
        and video_source.media_kind = 'video'
    )
  )`;
}

/** Pure counterpart of the repository predicate for lifecycle regression fixtures. */
export function isRetainedVideoDerivative(record: Pick<AssetRecord, 'operation' | 'status' | 'metadata' | 'workspaceId'>, source?: Pick<AssetRecord, 'id' | 'checksumSha256' | 'workspaceId' | 'status' | 'mediaKind'>) {
  return Boolean(source && record.status === 'ready' && operations.includes(record.operation ?? '') && source.status === 'ready'
    && source.mediaKind === 'video' && source.workspaceId === record.workspaceId
    && source.id === record.metadata?.sourceAssetId && source.checksumSha256 === record.metadata?.sourceChecksumSha256);
}
