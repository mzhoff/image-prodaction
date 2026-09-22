import { createDefaultUploadDependencies } from '@/entities/asset/server/asset-storage-support';
import { normalizeAssetProvenance, normalizeOriginalName } from '@/entities/asset/server/asset-normalization';
import { toAssetDto } from '@/entities/asset/server/asset-dto';
import { putMediaObject } from '@/entities/asset/server/media-object';
import type { MediaFile } from '@/shared/media/media-source';
import { createAssetObjectKey } from '@/shared/storage/s3-assets';
import { submitGenerationJob, toPublicGenerationJob } from './generation-submission-service';

/** The object exists durably before enqueueing. Pending assets cannot be read as media. */
export async function submitAssetIngest(input: {
  userId: string; workspaceId: string; documentId: string | null; origin: 'uploaded' | 'saved';
  mediaKind: 'image' | 'audio' | 'video'; file: MediaFile & { name: string; type: string }; signal: AbortSignal;
}) {
  const deps = createDefaultUploadDependencies();
  await deps.assertAccess(input);
  const id = deps.createId();
  const pending = await deps.repository.createPending({ id, workspaceId: input.workspaceId, documentId: input.documentId,
    createdByUserId: input.userId, bucket: deps.bucket,
    storageKey: createAssetObjectKey({ assetId: id, workspaceId: input.workspaceId, documentId: input.documentId, extension: 'upload' }),
    mediaKind: input.mediaKind, originalName: normalizeOriginalName(input.file.name, 'upload'),
    contentType: input.file.type || 'application/octet-stream', byteSize: input.file.byteLength,
    checksumSha256: input.file.checksumSha256, width: null, height: null,
    ...normalizeAssetProvenance({ ...input, maxBytes: input.file.byteLength, originalName: input.file.name, libraryVisible: true }),
  });
  try {
    await putMediaObject(deps.objectStore, pending, input.file, pending.contentType, input.signal);
  } catch (error) {
    await deps.repository.markFailed(id, 'upload_interrupted').catch(() => undefined); throw error;
  }
  // No request signal after this point: accepted processing survives a closed tab.
  const job = await submitGenerationJob({ userId: input.userId, workspaceId: input.workspaceId, documentId: input.documentId,
    idempotencyKey: `asset-ingest:${id}`, provider: 'local', modelId: 'media-inspection-v1', operation: 'asset_ingest', maxAttempts: 3,
    payload: { version: 1, assetId: id, checksumSha256: pending.checksumSha256 },
    metadata: { uploadAssetId: id, assetChecksum: pending.checksumSha256 } });
  return { asset: toAssetDto(pending), job: toPublicGenerationJob(job), statusUrl: `/api/generation-jobs/${job.id}` };
}
