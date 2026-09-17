import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getDb } from '@/shared/db/client';
import { asset as assetTable } from '@/shared/db/schema/asset';
import { MAX_VIDEO_OUTPUT_BYTES, VideoProcessingError, videoCropSchema, videoDeriveOptionsSchema, videoTrimRangeSchema, type VideoCrop, type VideoDeriveOptions, type VideoTrimRange } from '@/shared/media/video-contracts';
import { deriveVideoBytes, selectVideoAudioTrack } from '@/shared/media/video-processor';
import { persistAuthorizedAudioAsset } from './audio-asset-service';
import { getWorkspaceVideoAsset, persistAuthorizedVideoAsset, readWorkspaceVideoAsset } from './video-asset-service';
import { toAssetDto } from './asset-dto';
import { AssetProvenanceError, type AssetDto } from './asset-service-contracts';

export type DeriveWorkspaceVideoInput = VideoDeriveOptions & { workspaceId: string; userId: string; assetId: string; signal?: AbortSignal };
interface VideoDerivationDependencies {
  getSource: typeof getWorkspaceVideoAsset;
  readSource: typeof readWorkspaceVideoAsset;
  findReady(assetId: string, workspaceId: string): Promise<AssetDto | undefined>;
  derive: typeof deriveVideoBytes;
  persistAudio: typeof persistAuthorizedAudioAsset;
  persistVideo: typeof persistAuthorizedVideoAsset;
}
const active = new Map<string, Promise<AssetDto>>();
const defaults: VideoDerivationDependencies = {
  getSource: getWorkspaceVideoAsset, readSource: readWorkspaceVideoAsset, derive: deriveVideoBytes,
  persistAudio: persistAuthorizedAudioAsset, persistVideo: persistAuthorizedVideoAsset,
  async findReady(assetId, workspaceId) {
    const [record] = await getDb().select().from(assetTable).where(and(eq(assetTable.id, assetId), eq(assetTable.workspaceId, workspaceId), eq(assetTable.status, 'ready'))).limit(1);
    return record ? toAssetDto(record, record.mediaKind === 'video') : undefined;
  },
};

/** Caller MUST authorize its session/client/run for this Workspace first.
 * Deterministic ids reuse ready results across retries; the key includes actor attribution.
 * No URL or storage location from the request is used. */
export async function deriveWorkspaceVideoAsset(input: DeriveWorkspaceVideoInput, dependencies: VideoDerivationDependencies = defaults): Promise<AssetDto> {
  input.signal?.throwIfAborted();
  const options = videoDeriveOptionsSchema.parse({ kind: input.kind, ...(input.audioTrackIndex === undefined ? {} : { audioTrackIndex: input.audioTrackIndex }), ...(input.crop === undefined ? {} : { crop: input.crop }), ...(input.range === undefined ? {} : { range: input.range }) });
  const source = await dependencies.getSource({ assetId: input.assetId, workspaceId: input.workspaceId });
  if (source.workspaceId !== input.workspaceId || source.id !== input.assetId) throw new AssetProvenanceError('Video source does not belong to the requested Workspace.');
  if (options.kind === 'trim' && options.range!.endMs > source.video.durationSeconds * 1000 + 1) throw new VideoProcessingError('invalid_video_trim', 'Choose a time interval inside the source video.', 400);
  if (options.kind === 'preview' && source.video.browserPlayable && options.audioTrackIndex === undefined) return source;
  const track = options.kind !== 'video-only' && (source.video.audioTracks.length || options.audioTrackIndex !== undefined || options.kind === 'audio')
    ? selectVideoAudioTrack(source.video, options.audioTrackIndex).index : undefined;
  const id = createVideoDerivativeId({ workspaceId: input.workspaceId, userId: input.userId, assetId: source.id, checksumSha256: source.checksumSha256, kind: options.kind, audioTrackIndex: track, crop: options.crop, range: options.range });
  const existing = await dependencies.findReady(id, input.workspaceId);
  if (existing) {
    if (existing.metadata?.sourceAssetId !== source.id || existing.metadata?.sourceChecksumSha256 !== source.checksumSha256 || existing.operation !== `video_${options.kind}`
      || existing.mediaKind !== (options.kind === 'audio' ? 'audio' : 'video') || existing.metadata?.audioTrackIndex !== track
      || (options.kind === 'crop' && !sameVideoCrop(existing.metadata?.crop, options.crop!))
      || (options.kind === 'trim' && !sameVideoTrim(existing.metadata?.range, options.range!))
      || (existing.mediaKind === 'video' ? !existing.video : !existing.audio)) throw new AssetProvenanceError('Cached video derivation does not match its source.');
    return existing;
  }
  // A second request can retry once the active task is ready, without sharing cancellation signals.
  if (active.has(id)) throw new VideoProcessingError('video_derivation_busy', 'This video output is already being prepared. Retry shortly.', 409);
  if (active.size >= 2) throw new VideoProcessingError('video_busy', 'Video processing is busy. Retry shortly.', 503);
  const work = (async () => {
    const loaded = await dependencies.readSource({ assetId: source.id, workspaceId: input.workspaceId, signal: input.signal });
    if (loaded.asset.checksumSha256 !== source.checksumSha256) throw new AssetProvenanceError('Video source changed during derivation.');
    const result = await dependencies.derive({ bytes: loaded.bytes, options: { ...options, ...(track === undefined ? {} : { audioTrackIndex: track }) }, signal: input.signal });
    const persistence = {
      bytes: result.bytes, claimedContentType: result.contentType, documentId: source.documentId, originalName: `${options.kind}.${result.extension}`,
      maxBytes: MAX_VIDEO_OUTPUT_BYTES, userId: input.userId, workspaceId: input.workspaceId, signal: input.signal, requestedAssetId: id,
      origin: 'unknown' as const, operation: `video_${options.kind}`, libraryVisible: false,
      metadata: { sourceAssetId: source.id, sourceChecksumSha256: source.checksumSha256, derivationVersion: 1, ...(track === undefined ? {} : { audioTrackIndex: track }), ...(options.crop ? { crop: options.crop } : {}), ...(options.range ? { range: options.range } : {}) },
    };
    return 'video' in result ? dependencies.persistVideo(persistence, result) : dependencies.persistAudio(persistence, result);
  })();
  active.set(id, work);
  try { return await work; } finally { active.delete(id); }
}

export function createVideoDerivativeId(input: { workspaceId: string; userId: string; assetId: string; checksumSha256: string; kind: VideoDeriveOptions['kind']; audioTrackIndex?: number; crop?: VideoCrop; range?: VideoTrimRange }) {
  // Keep existing derivative ids stable; only the new crop kind adds its canonical bounds.
  const crop = input.kind === 'crop' ? videoCropSchema.parse(input.crop) : undefined;
  const range = input.kind === 'trim' ? videoTrimRangeSchema.parse(input.range) : undefined;
  const hash = createHash('sha256').update(JSON.stringify(['video-derive-v1', input.workspaceId, input.userId, input.assetId, input.checksumSha256, input.kind, input.audioTrackIndex ?? null,
    ...(crop ? [[crop.x, crop.y, crop.width, crop.height]] : []), ...(range ? [[range.startMs, range.endMs]] : [])])).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-7${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function sameVideoCrop(value: unknown, expected: VideoCrop) {
  const parsed = videoCropSchema.safeParse(value);
  return parsed.success && parsed.data.x === expected.x && parsed.data.y === expected.y && parsed.data.width === expected.width && parsed.data.height === expected.height;
}
function sameVideoTrim(value: unknown, expected: VideoTrimRange) {
  const parsed = videoTrimRangeSchema.safeParse(value);
  return parsed.success && parsed.data.startMs === expected.startMs && parsed.data.endMs === expected.endMs;
}
