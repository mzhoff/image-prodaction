import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getDb } from '@/shared/db/client';
import { asset as assetTable } from '@/shared/db/schema/asset';
import { audioMetadataSchema, AudioProcessingError, MAX_AUDIO_OUTPUT_BYTES, type AudioMetadata, type ValidatedAudio } from '@/shared/media/audio-contracts';
import { inspectAudioBytes } from '@/shared/media/audio-processor';
import { readBoundedAudioStream } from '@/shared/media/audio-upload-request';
import { createAssetObjectKey, getAssetObjectStore } from '@/shared/storage/s3-assets';
import { AssetNotFoundError, AssetProvenanceError, AssetStorageError, type AssetDto, type AssetUploadDependencies, type UploadImageAssetInput } from './asset-service-contracts';
import { createDefaultUploadDependencies, logStorageFailure } from './asset-storage-support';
import { normalizeAssetProvenance, normalizeOriginalName } from './asset-normalization';
import { toAssetDto } from './asset-dto';

export type AudioAssetDto = AssetDto & { mediaKind: 'audio'; audio: AudioMetadata };
export interface UploadAudioAssetInput extends UploadImageAssetInput { maxDurationSeconds?: number; signal?: AbortSignal }

export async function uploadAudioAsset(input: UploadAudioAssetInput, dependencies = createDefaultUploadDependencies()): Promise<AudioAssetDto> {
  await dependencies.assertAccess({ documentId: input.documentId ?? null, userId: input.userId, workspaceId: input.workspaceId });
  const inspected = await inspectAudioBytes(input.bytes, { maxBytes: input.maxBytes, maxDurationSeconds: input.maxDurationSeconds, claimedContentType: input.claimedContentType, signal: input.signal });
  return persistAuthorizedAudioAsset(input, inspected, dependencies);
}

/** Server-only primitive. Caller MUST resolve session/client/run authorization before calling.
 * userId is audit attribution, never a substitute for service-client authorization. */
export async function persistAuthorizedAudioAsset(input: UploadAudioAssetInput, inspected: ValidatedAudio, dependencies: AssetUploadDependencies = createDefaultUploadDependencies()): Promise<AudioAssetDto> {
  input.signal?.throwIfAborted();
  const provenance = normalizeAssetProvenance(input);
  const id = input.requestedAssetId ?? dependencies.createId();
  const existing = !input.requestedAssetId && input.generationJobId && provenance.origin === 'generated'
    ? await dependencies.repository.findGeneratedByJobId(input.generationJobId) : undefined;
  const record = {
    id, workspaceId: input.workspaceId, documentId: input.documentId ?? null, createdByUserId: input.userId,
    bucket: dependencies.bucket, storageKey: createAssetObjectKey({ assetId: id, documentId: input.documentId, extension: inspected.extension, workspaceId: input.workspaceId }),
    originalName: normalizeOriginalName(input.originalName, inspected.extension), contentType: inspected.contentType,
    byteSize: inspected.byteSize, width: null, height: null, checksumSha256: inspected.checksumSha256, mediaKind: 'audio' as const,
    ...provenance, metadata: { ...provenance.metadata, audio: inspected.audio },
  };
  const claim = existing ? { record: existing, created: false } : await dependencies.repository.createPendingOrFind(record);
  let pending = claim.record;
  if (!claim.created) {
    if (pending.workspaceId !== record.workspaceId || pending.documentId !== record.documentId || pending.createdByUserId !== record.createdByUserId
      || pending.checksumSha256 !== record.checksumSha256 || pending.mediaKind !== 'audio' || pending.operation !== record.operation
      || pending.generationJobId !== record.generationJobId || pending.origin !== record.origin) throw new AssetProvenanceError('Existing audio asset does not match the retry payload.');
    if (pending.status === 'ready') return asAudioDto(toAssetDto(pending));
    if (!['pending', 'failed'].includes(pending.status)) throw new AssetStorageError();
    pending = await dependencies.repository.resetPending(pending.id);
  }
  try {
    await dependencies.objectStore.put({ bucket: pending.bucket, key: pending.storageKey, body: inspected.bytes, contentType: inspected.contentType });
    input.signal?.throwIfAborted();
    return asAudioDto(toAssetDto(await dependencies.repository.markReady(pending.id)));
  } catch (error) {
    logStorageFailure('audio-upload', pending.id, error);
    await dependencies.repository.markFailed(pending.id, 'audio_storage_upload_failed').catch(() => undefined);
    throw new AssetStorageError();
  }
}

/** Internal worker/service access: callers authorize the Workspace independently of publisher membership. */
export async function readWorkspaceAudioAsset(input: { assetId: string; workspaceId: string; signal?: AbortSignal }) {
  const [record] = await getDb().select().from(assetTable).where(and(eq(assetTable.id, input.assetId), eq(assetTable.workspaceId, input.workspaceId), eq(assetTable.mediaKind, 'audio'), eq(assetTable.status, 'ready'))).limit(1);
  if (!record || record.byteSize > MAX_AUDIO_OUTPUT_BYTES) throw new AssetNotFoundError();
  const parsed = audioMetadataSchema.safeParse(record.metadata?.audio);
  if (!parsed.success || parsed.data.contentType !== record.contentType) throw new AudioProcessingError('invalid_audio_metadata', 'Stored audio metadata is invalid.');
  const object = await getAssetObjectStore().get({ bucket: record.bucket, key: record.storageKey });
  const bytes = await readBoundedAudioStream(object.body, MAX_AUDIO_OUTPUT_BYTES, input.signal);
  if (bytes.length !== record.byteSize || createHash('sha256').update(bytes).digest('hex') !== record.checksumSha256) throw new AudioProcessingError('audio_checksum_mismatch', 'Stored audio does not match its checksum.');
  return { asset: asAudioDto(toAssetDto(record)), bytes, audio: parsed.data };
}

function asAudioDto(value: AssetDto): AudioAssetDto {
  if (value.mediaKind !== 'audio' || !value.audio) throw new AudioProcessingError('invalid_audio_metadata', 'Audio metadata is missing.');
  return { ...value, mediaKind: 'audio', audio: value.audio };
}
