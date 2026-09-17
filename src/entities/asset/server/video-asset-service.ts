import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getDb } from '@/shared/db/client';
import { asset as assetTable } from '@/shared/db/schema/asset';
import { videoMetadataSchema, VideoProcessingError, MAX_VIDEO_OUTPUT_BYTES, type VideoMetadata, type ValidatedVideo } from '@/shared/media/video-contracts';
import { inspectVideoBytes } from '@/shared/media/video-processor';
import { readBoundedAudioStream } from '@/shared/media/audio-upload-request';
import { createAssetObjectKey, getAssetObjectStore } from '@/shared/storage/s3-assets';
import { AssetNotFoundError, AssetProvenanceError, AssetStorageError, type AssetDto, type AssetUploadDependencies, type UploadImageAssetInput } from './asset-service-contracts';
import { createDefaultUploadDependencies, logStorageFailure, storeThumbnailVariant } from './asset-storage-support';
import { normalizeAssetProvenance, normalizeOriginalName } from './asset-normalization';
import { toAssetDto } from './asset-dto';

export type VideoAssetDto = AssetDto & { mediaKind: 'video'; video: VideoMetadata };
export interface UploadVideoAssetInput extends UploadImageAssetInput { maxDurationSeconds?: number; signal?: AbortSignal }

export async function uploadVideoAsset(input: UploadVideoAssetInput, dependencies = createDefaultUploadDependencies()): Promise<VideoAssetDto> {
  await dependencies.assertAccess({ documentId: input.documentId ?? null, userId: input.userId, workspaceId: input.workspaceId });
  const inspected = await inspectVideoBytes(input.bytes, { maxBytes: input.maxBytes, maxDurationSeconds: input.maxDurationSeconds, claimedContentType: input.claimedContentType, signal: input.signal });
  return persistAuthorizedVideoAsset(input, inspected, dependencies);
}

/** Server-only primitive: caller resolves session/service/run authorization before calling.
 * Original and derived assets have distinct immutable ids and objects. */
export async function persistAuthorizedVideoAsset(input: UploadVideoAssetInput, inspected: ValidatedVideo, dependencies: AssetUploadDependencies = createDefaultUploadDependencies()): Promise<VideoAssetDto> {
  input.signal?.throwIfAborted();
  const provenance = normalizeAssetProvenance(input);
  const id = input.requestedAssetId ?? dependencies.createId();
  const record = {
    id, workspaceId: input.workspaceId, documentId: input.documentId ?? null, createdByUserId: input.userId,
    bucket: dependencies.bucket, storageKey: createAssetObjectKey({ assetId: id, documentId: input.documentId, extension: inspected.extension, workspaceId: input.workspaceId }),
    originalName: normalizeOriginalName(input.originalName, inspected.extension), contentType: inspected.contentType,
    byteSize: inspected.byteSize, width: inspected.video.width, height: inspected.video.height, checksumSha256: inspected.checksumSha256, mediaKind: 'video' as const,
    ...provenance, metadata: { ...provenance.metadata, video: inspected.video },
  };
  const claim = await dependencies.repository.createPendingOrFind(record);
  let pending = claim.record;
  if (!claim.created) {
    if (pending.workspaceId !== record.workspaceId || pending.documentId !== record.documentId || pending.createdByUserId !== record.createdByUserId
      || pending.checksumSha256 !== record.checksumSha256 || pending.mediaKind !== 'video' || pending.operation !== record.operation
      || pending.generationJobId !== record.generationJobId || pending.origin !== record.origin) throw new AssetProvenanceError('Existing video asset does not match the retry payload.');
    if (pending.status === 'ready') return asVideoAssetDto(toAssetDto(pending, Boolean(dependencies.createVideoThumbnail)));
    if (!['pending', 'failed'].includes(pending.status)) throw new AssetStorageError();
    pending = await dependencies.repository.resetPending(pending.id);
  }
  try {
    await dependencies.objectStore.put({ bucket: pending.bucket, key: pending.storageKey, body: inspected.bytes, contentType: inspected.contentType });
    input.signal?.throwIfAborted();
    if (dependencies.createVideoThumbnail) {
      const thumbnail = await dependencies.createVideoThumbnail(inspected.bytes, input.signal);
      input.signal?.throwIfAborted();
      await storeThumbnailVariant(pending, thumbnail, dependencies);
    }
    input.signal?.throwIfAborted();
    return asVideoAssetDto(toAssetDto(await dependencies.repository.markReady(pending.id), Boolean(dependencies.createVideoThumbnail)));
  } catch (error) {
    logStorageFailure('video-upload', pending.id, error);
    await dependencies.repository.markFailed(pending.id, 'video_storage_upload_failed').catch(() => undefined);
    throw new AssetStorageError();
  }
}

/** Internal worker/service access: callers authorize the Workspace independently of publisher membership. */
export async function getWorkspaceVideoAsset(input: { assetId: string; workspaceId: string }): Promise<VideoAssetDto> {
  return asVideoAssetDto(toAssetDto(await requireWorkspaceVideoRecord(input)));
}
export async function readWorkspaceVideoAsset(input: { assetId: string; workspaceId: string; signal?: AbortSignal }) {
  input.signal?.throwIfAborted();
  const record = await requireWorkspaceVideoRecord(input);
  const dto = asVideoAssetDto(toAssetDto(record));
  const object = await getAssetObjectStore().get({ bucket: record.bucket, key: record.storageKey });
  const bytes = await readBoundedAudioStream(object.body, MAX_VIDEO_OUTPUT_BYTES, input.signal);
  if (bytes.length !== record.byteSize || createHash('sha256').update(bytes).digest('hex') !== record.checksumSha256) throw new VideoProcessingError('video_checksum_mismatch', 'Stored video does not match its checksum.');
  return { asset: dto, bytes, video: dto.video };
}
async function requireWorkspaceVideoRecord(input: { assetId: string; workspaceId: string }) {
  const [record] = await getDb().select().from(assetTable).where(and(eq(assetTable.id, input.assetId), eq(assetTable.workspaceId, input.workspaceId), eq(assetTable.mediaKind, 'video'), eq(assetTable.status, 'ready'))).limit(1);
  if (!record || record.byteSize > MAX_VIDEO_OUTPUT_BYTES) throw new AssetNotFoundError();
  const parsed = videoMetadataSchema.safeParse(record.metadata?.video);
  if (!parsed.success || parsed.data.contentType !== record.contentType || parsed.data.width !== record.width || parsed.data.height !== record.height) throw new VideoProcessingError('invalid_video_metadata', 'Stored video metadata is invalid.');
  return record;
}
export function asVideoAssetDto(value: AssetDto): VideoAssetDto {
  if (value.mediaKind !== 'video' || !value.video) throw new VideoProcessingError('invalid_video_metadata', 'Video metadata is missing.');
  return { ...value, mediaKind: 'video', video: value.video };
}
