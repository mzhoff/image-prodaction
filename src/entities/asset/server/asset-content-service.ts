import type { AssetVariantPurpose } from './asset-repository';
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
) {
  const record = await requireAccessibleAsset(userId, assetId, dependencies.repository);
  if (record.status === 'deleted') throw new AssetNotFoundError();
  if (record.status !== 'ready') throw new AssetNotReadyError();
  let variant = purpose ? await dependencies.repository.findVariant(record.id, purpose) : undefined;
  try {
    if (purpose === 'thumbnail' && !variant && dependencies.createId && dependencies.createThumbnail) {
      const original = await dependencies.objectStore.get({ bucket: record.bucket, key: record.storageKey });
      const bytes = new Uint8Array(await new Response(original.body).arrayBuffer());
      await storeThumbnailVariant(record, await dependencies.createThumbnail(bytes), {
        ...dependencies,
        createId: dependencies.createId,
      });
      variant = await dependencies.repository.findVariant(record.id, purpose);
    }
    if (purpose && !variant) throw new AssetNotFoundError();
    const location = variant ?? record;
    const object = await dependencies.objectStore.get({
      bucket: location.bucket,
      key: location.storageKey,
    });
    return {
      asset: toAssetDto(record, Boolean(variant)),
      byteSize: variant?.byteSize ?? record.byteSize,
      contentType: variant?.contentType ?? record.contentType,
      object,
    };
  } catch (error) {
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
