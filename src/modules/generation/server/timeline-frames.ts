import { createHash } from 'node:crypto';
import { AssetNotFoundError, getAssetContent, getAssetMetadata, uploadImageAsset } from '@/entities/asset/server/asset-service';
import { getWorkspaceVideoAsset, readWorkspaceVideoAsset } from '@/entities/asset/server/video-asset-service';
import { readBoundedBytes } from '@/shared/media/bounded-bytes';
import { MAX_TIMELINE_DURATION_MS } from '@/shared/media/timeline-contracts';
import { extractTimelineFrameBytes } from '@/shared/media/timeline-processor';
import { VideoProcessingError } from '@/shared/media/video-contracts';

export function timelineFrameAssetId(workspaceId: string, userId: string, sourceId: string, checksum: string, timeMs: number) {
  const hash = createHash('sha256').update(JSON.stringify(['timeline-frame-v1', workspaceId, userId, sourceId, checksum, timeMs])).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-7${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Private, immutable still cache. Caller has authorized the Workspace. No user URL is fetched. */
export async function getTimelineFrame(input: { userId: string; workspaceId: string; assetId: string; timeMs: number; signal?: AbortSignal; sourceBytes?: Uint8Array; extract?: (timeMs: number) => Promise<Uint8Array> }) {
  const source = await getWorkspaceVideoAsset(input);
  if (!Number.isFinite(input.timeMs) || input.timeMs < 0 || input.timeMs >= source.video.durationSeconds * 1000
    || source.video.durationSeconds * 1000 > MAX_TIMELINE_DURATION_MS) throw new VideoProcessingError('invalid_timeline_frame', 'Choose a frame inside a video of up to 5 minutes.');
  const assetId = timelineFrameAssetId(input.workspaceId, input.userId, source.id, source.checksumSha256, input.timeMs);
  try {
    const asset = await getAssetMetadata(input.userId, assetId);
    if (asset.mediaKind !== 'image' || asset.workspaceId !== input.workspaceId || asset.metadata?.sourceAssetId !== source.id
      || asset.metadata?.sourceChecksumSha256 !== source.checksumSha256 || asset.metadata?.timelineTimeMs !== input.timeMs) throw new VideoProcessingError('invalid_timeline_frame', 'Stored frame provenance does not match the source.');
    const content = await getAssetContent(input.userId, assetId);
    return { assetId, bytes: await readBoundedBytes(new Response(content.object.body), 4 * 1024 * 1024, input.signal) };
  } catch (error) { if (!(error instanceof AssetNotFoundError)) throw error; }
  const bytes = input.extract ? await input.extract(input.timeMs) : await extractTimelineFrameBytes({
    bytes: input.sourceBytes ?? (await readWorkspaceVideoAsset(input)).bytes, timeMs: input.timeMs, signal: input.signal });
  input.signal?.throwIfAborted();
  const asset = await uploadImageAsset({ userId: input.userId, workspaceId: input.workspaceId, documentId: source.documentId,
    bytes, maxBytes: 4 * 1024 * 1024, claimedContentType: 'image/jpeg', originalName: 'timeline-frame.jpg', requestedAssetId: assetId,
    origin: 'unknown', operation: 'timeline_frame', libraryVisible: false,
    metadata: { sourceAssetId: source.id, sourceChecksumSha256: source.checksumSha256, timelineTimeMs: input.timeMs },
  });
  return { assetId: asset.id, bytes };
}
