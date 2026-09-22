import { readStoredMediaFile } from '@/shared/media/stored-media-file';
import { readFile } from 'node:fs/promises';
import { MAX_VIDEO_BYTES } from '@/shared/media/video-contracts';
import { getMaxImageUploadBytes } from './asset-storage-support';
import type { AssetVariantPurpose } from './asset-repository';
import { AssetRangeError, parseAssetByteRange } from '@/shared/storage/byte-range';
import { toAssetDto } from './asset-dto';
import {
  AssetNotFoundError,
  AssetNotReadyError,
  AssetStorageError,
  type AssetStorageDependencies,
} from './asset-service-contracts';
import {
  createDefaultStorageDependencies,
  deleteStoredAssetObjects,
  logStorageFailure,
  requireAccessibleAsset,
  storeThumbnailVariant,
} from './asset-storage-support';

export async function getAssetContent(
  userId: string,
  assetId: string,
  dependencies: AssetStorageDependencies = createDefaultStorageDependencies(),
  purpose?: AssetVariantPurpose,
  rangeHeader?: string,
) {
  const record = await requireAccessibleAsset(userId, assetId, dependencies.repository);
  if (record.status === 'deleted') throw new AssetNotFoundError();
  if (record.status !== 'ready') throw new AssetNotReadyError();
  let variant = purpose ? await dependencies.repository.findVariant(record.id, purpose) : undefined;
  try {
    if (purpose === 'thumbnail' && !variant && dependencies.createId) {
      const original = await dependencies.objectStore.get({ bucket: record.bucket, key: record.storageKey });
      const source = await readStoredMediaFile({ body: original.body, byteSize: record.byteSize, checksumSha256: record.checksumSha256,
        maxBytes: record.mediaKind === 'video' ? MAX_VIDEO_BYTES : getMaxImageUploadBytes() });
      const thumbnail = await (async () => {
        try {
          return record.mediaKind === 'image' && dependencies.createThumbnail
            ? await dependencies.createThumbnail(await readFile(source.bytes.path))
            : record.mediaKind === 'video' && dependencies.createVideoThumbnail ? await dependencies.createVideoThumbnail(source.bytes) : null;
        } finally { await source.dispose(); }
      })();
      if (!thumbnail) throw new AssetNotFoundError();
      await storeThumbnailVariant(record, thumbnail, {
        ...dependencies,
        createId: dependencies.createId,
      });
      variant = await dependencies.repository.findVariant(record.id, purpose);
    }
    if (purpose && !variant) throw new AssetNotFoundError();
    const location = variant ?? record;
    const range = parseAssetByteRange(rangeHeader, location.byteSize);
    const object = await dependencies.objectStore.get({
      bucket: location.bucket,
      key: location.storageKey,
      range,
    });
    return {
      asset: toAssetDto(record, Boolean(variant)),
      byteSize: variant?.byteSize ?? record.byteSize,
      contentType: variant?.contentType ?? record.contentType,
      object,
      range,
    };
  } catch (error) {
    if (error instanceof AssetRangeError || error instanceof AssetNotFoundError) throw error;
    logStorageFailure('read', record.id, error);
    throw new AssetStorageError();
  }
}

export async function deleteAsset(
  userId: string,
  assetId: string,
  dependencies: AssetStorageDependencies = createDefaultStorageDependencies(),
) {
  const record = await requireAccessibleAsset(userId, assetId, dependencies.repository);
  if (record.status === 'deleted') return;
  try {
    await deleteStoredAssetObjects(record, dependencies);
  } catch (error) {
    logStorageFailure('delete', record.id, error);
    throw new AssetStorageError();
  }
  await dependencies.repository.markDeleted(record.id, new Date());
}

export async function cleanupOrphanedAssets(
  input: { before: Date; limit?: number },
  dependencies: AssetStorageDependencies = createDefaultStorageDependencies(),
) {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const candidates = await dependencies.repository.findCleanupCandidates(input.before, limit);
  let deleted = 0;
  let failed = 0;
  for (const record of candidates) {
    try {
      await deleteStoredAssetObjects(record, dependencies);
      await dependencies.repository.markDeleted(record.id, new Date());
      deleted += 1;
    } catch (error) {
      failed += 1;
      logStorageFailure('orphan-cleanup', record.id, error);
    }
  }
  return { scanned: candidates.length, deleted, failed };
}

/** Precondition for permanent document deletion; caller must authorize the document first. */
export async function cleanupDocumentAssets(
  documentId: string,
  dependencies: AssetStorageDependencies = createDefaultStorageDependencies(),
) {
  const records = await dependencies.repository.listByDocument(documentId);
  let deleted = 0;
  let preserved = 0;
  for (const record of records) {
    if (record.libraryVisible && record.status === 'ready') {
      preserved += 1;
      continue;
    }
    try {
      await deleteStoredAssetObjects(record, dependencies);
    } catch (error) {
      logStorageFailure('document-cleanup', record.id, error);
      throw new AssetStorageError();
    }
    await dependencies.repository.markDeleted(record.id, new Date());
    deleted += 1;
  }
  return { scanned: records.length, deleted, preserved };
}
