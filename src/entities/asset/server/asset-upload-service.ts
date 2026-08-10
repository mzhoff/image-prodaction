import { validateImageBytes } from '@/shared/storage/image-policy';
import { createAssetObjectKey } from '@/shared/storage/s3-assets';
import type { AssetRecord } from './asset-repository';
import { toAssetDto } from './asset-dto';
import { normalizeAssetProvenance, normalizeOriginalName } from './asset-normalization';
import {
  AssetProvenanceError,
  AssetStorageError,
  type AssetUploadDependencies,
  type UploadImageAssetInput,
} from './asset-service-contracts';
import {
  createDefaultUploadDependencies,
  logStorageFailure,
  storeThumbnailVariant,
} from './asset-storage-support';

export async function uploadImageAsset(
  input: UploadImageAssetInput,
  dependencies: AssetUploadDependencies = createDefaultUploadDependencies(),
) {
  const image = validateImageBytes(input.bytes, {
    claimedContentType: input.claimedContentType,
    maxBytes: input.maxBytes,
  });
  const documentId = input.documentId ?? null;
  const provenance = normalizeAssetProvenance(input);
  await dependencies.assertAccess({ documentId, userId: input.userId, workspaceId: input.workspaceId });
  const existing = input.generationJobId && provenance.origin === 'generated'
    ? await dependencies.repository.findGeneratedByJobId(input.generationJobId)
    : undefined;
  const pending = existing
    ? await prepareGeneratedAssetRetry(existing, input, image.checksumSha256, dependencies)
    : await createPendingImageAsset(input, documentId, provenance, image, dependencies);
  if (pending.status === 'ready') return toAssetDto(pending);

  try {
    await dependencies.objectStore.put({
      bucket: pending.bucket,
      key: pending.storageKey,
      body: image.buffer,
      contentType: image.contentType,
    });
    const ready = await dependencies.repository.markReady(pending.id);
    const hasThumbnail = await tryStoreThumbnail(ready, image.buffer, dependencies);
    return toAssetDto(ready, hasThumbnail);
  } catch (error) {
    logStorageFailure('upload', pending.id, error);
    await dependencies.repository.markFailed(pending.id, 'storage_upload_failed')
      .catch((markError: unknown) => logStorageFailure('mark-failed', pending.id, markError));
    throw new AssetStorageError();
  }
}

async function prepareGeneratedAssetRetry(
  existing: AssetRecord,
  input: UploadImageAssetInput,
  checksumSha256: string,
  dependencies: AssetUploadDependencies,
) {
  if (existing.workspaceId !== input.workspaceId
    || existing.documentId !== (input.documentId ?? null)
    || existing.createdByUserId !== input.userId
    || existing.generationJobId !== input.generationJobId
    || existing.origin !== 'generated'
    || existing.checksumSha256 !== checksumSha256) {
    throw new AssetProvenanceError('Existing generated asset does not match the retry payload.');
  }
  if (existing.status === 'ready') return existing;
  if (existing.status !== 'pending' && existing.status !== 'failed') throw new AssetStorageError();
  return dependencies.repository.resetPending(existing.id);
}

async function createPendingImageAsset(
  input: UploadImageAssetInput,
  documentId: string | null,
  provenance: ReturnType<typeof normalizeAssetProvenance>,
  image: ReturnType<typeof validateImageBytes>,
  dependencies: AssetUploadDependencies,
) {
  const assetId = dependencies.createId();
  return dependencies.repository.createPending({
    id: assetId,
    workspaceId: input.workspaceId,
    documentId,
    createdByUserId: input.userId,
    bucket: dependencies.bucket,
    storageKey: createAssetObjectKey({
      assetId, documentId, extension: image.extension, workspaceId: input.workspaceId,
    }),
    originalName: normalizeOriginalName(input.originalName, image.extension),
    contentType: image.contentType,
    byteSize: image.byteSize,
    width: image.width ?? null,
    height: image.height ?? null,
    checksumSha256: image.checksumSha256,
    mediaKind: 'image',
    ...provenance,
  });
}

async function tryStoreThumbnail(
  record: AssetRecord,
  bytes: Uint8Array,
  dependencies: AssetUploadDependencies,
) {
  if (!dependencies.createThumbnail) return false;
  try {
    await storeThumbnailVariant(record, await dependencies.createThumbnail(bytes), dependencies);
    return true;
  } catch (error) {
    logStorageFailure('thumbnail-create', record.id, error);
    return false;
  }
}
