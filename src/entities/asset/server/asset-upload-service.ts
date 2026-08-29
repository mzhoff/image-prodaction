import { validateImageBytes } from '@/shared/storage/image-policy';
import { createAssetObjectKey } from '@/shared/storage/s3-assets';
import type { AssetRecord, PendingAssetInput } from './asset-repository';
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
  const existing = !input.requestedAssetId && input.generationJobId && provenance.origin === 'generated'
    ? await dependencies.repository.findGeneratedByJobId(input.generationJobId)
    : undefined;
  const pending = input.requestedAssetId
    ? await claimRequestedImageAsset(input, documentId, provenance, image, dependencies)
    : existing
      ? await prepareAssetRetry(existing, input, provenance, image.checksumSha256, dependencies)
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

async function prepareAssetRetry(
  existing: AssetRecord,
  input: UploadImageAssetInput,
  provenance: ReturnType<typeof normalizeAssetProvenance>,
  checksumSha256: string,
  dependencies: AssetUploadDependencies,
) {
  if (existing.workspaceId !== input.workspaceId
    || existing.documentId !== (input.documentId ?? null)
    || existing.createdByUserId !== input.userId
    || existing.generationJobId !== provenance.generationJobId
    || existing.origin !== provenance.origin
    || existing.operation !== provenance.operation
    || existing.checksumSha256 !== checksumSha256) {
    throw new AssetProvenanceError('Existing asset does not match the retry payload.');
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
  return dependencies.repository.createPending(createPendingImageAssetInput(
    input,
    documentId,
    provenance,
    image,
    dependencies,
    dependencies.createId(),
  ));
}

async function claimRequestedImageAsset(
  input: UploadImageAssetInput,
  documentId: string | null,
  provenance: ReturnType<typeof normalizeAssetProvenance>,
  image: ReturnType<typeof validateImageBytes>,
  dependencies: AssetUploadDependencies,
) {
  const assetId = input.requestedAssetId;
  if (!assetId) throw new Error('A requested asset id is required.');
  const claim = await dependencies.repository.createPendingOrFind(createPendingImageAssetInput(
    input,
    documentId,
    provenance,
    image,
    dependencies,
    assetId,
  ));
  return claim.created
    ? claim.record
    : prepareAssetRetry(claim.record, input, provenance, image.checksumSha256, dependencies);
}

function createPendingImageAssetInput(
  input: UploadImageAssetInput,
  documentId: string | null,
  provenance: ReturnType<typeof normalizeAssetProvenance>,
  image: ReturnType<typeof validateImageBytes>,
  dependencies: AssetUploadDependencies,
  assetId: string,
): PendingAssetInput {
  return {
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
  };
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
