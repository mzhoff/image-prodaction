import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { getDocument } from '@/entities/document/server/document-service';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { createUuidV7 } from '@/shared/lib/id';
import {
  getAssetObjectStore,
  getConfiguredAssetBucket,
} from '@/shared/storage/s3-assets';
import { createDbAssetRepository, type AssetRecord, type AssetRepository } from './asset-repository';
import {
  AssetDocumentWorkspaceMismatchError,
  AssetNotFoundError,
  type AssetLibraryDependencies,
  type AssetStorageDependencies,
  type AssetUploadDependencies,
  type ThumbnailImage,
} from './asset-service-contracts';

const DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
const LIBRARY_THUMBNAIL_MAX_SIDE = 560;
const LIBRARY_THUMBNAIL_QUALITY = 82;

export function getMaxImageUploadBytes() {
  const parsed = Number.parseInt(process.env.S3_MAX_IMAGE_BYTES ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_IMAGE_UPLOAD_BYTES;
}

export function createDefaultUploadDependencies(): AssetUploadDependencies {
  return {
    assertAccess: assertUploadAccess,
    bucket: getConfiguredAssetBucket(),
    createThumbnail: createLibraryThumbnail,
    createId: createUuidV7,
    objectStore: getAssetObjectStore(),
    repository: createDbAssetRepository(),
  };
}

export function createDefaultStorageDependencies(): AssetStorageDependencies {
  return {
    createId: createUuidV7,
    createThumbnail: createLibraryThumbnail,
    objectStore: getAssetObjectStore(),
    repository: createDbAssetRepository(),
  };
}

export function createDefaultLibraryDependencies(): AssetLibraryDependencies {
  return { assertMembership: requireWorkspaceMembership, repository: createDbAssetRepository() };
}

export async function requireAccessibleAsset(
  userId: string,
  assetId: string,
  repository: AssetRepository,
) {
  const record = await repository.findAccessible(assetId, userId);
  if (!record) throw new AssetNotFoundError();
  return record;
}

export async function storeThumbnailVariant(
  record: AssetRecord,
  thumbnail: ThumbnailImage,
  dependencies: AssetStorageDependencies & { createId(): string },
) {
  const storageKey = createThumbnailStorageKey(record.storageKey);
  await dependencies.objectStore.put({
    bucket: record.bucket,
    key: storageKey,
    body: thumbnail.bytes,
    contentType: thumbnail.contentType,
  });
  try {
    await dependencies.repository.upsertVariant({
      id: dependencies.createId(),
      assetId: record.id,
      purpose: 'thumbnail',
      bucket: record.bucket,
      storageKey,
      contentType: thumbnail.contentType,
      byteSize: thumbnail.byteSize,
      width: thumbnail.width,
      height: thumbnail.height,
      checksumSha256: thumbnail.checksumSha256,
    });
  } catch (error) {
    await dependencies.objectStore.delete({ bucket: record.bucket, key: storageKey })
      .catch((deleteError: unknown) => logStorageFailure('thumbnail-rollback', record.id, deleteError));
    throw error;
  }
}

export async function deleteStoredAssetObjects(
  record: AssetRecord,
  dependencies: AssetStorageDependencies,
) {
  const variants = await dependencies.repository.listVariants(record.id);
  for (const variant of variants) {
    await dependencies.objectStore.delete({ bucket: variant.bucket, key: variant.storageKey });
  }
  await dependencies.objectStore.delete({ bucket: record.bucket, key: record.storageKey });
}

export function logStorageFailure(operation: string, assetId: string, error: unknown) {
  console.error('Asset storage operation failed', {
    operation,
    assetId,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
}

async function assertUploadAccess(input: {
  documentId: string | null;
  userId: string;
  workspaceId: string;
}) {
  await requireWorkspaceMembership(input.userId, input.workspaceId);
  if (!input.documentId) return;
  const targetDocument = await getDocument(input.userId, input.documentId);
  if (targetDocument.workspaceId !== input.workspaceId) throw new AssetDocumentWorkspaceMismatchError();
}

function createThumbnailStorageKey(storageKey: string) {
  const extensionIndex = storageKey.lastIndexOf('.');
  const base = extensionIndex > storageKey.lastIndexOf('/')
    ? storageKey.slice(0, extensionIndex)
    : storageKey;
  return `${base}.thumbnail.webp`;
}

async function createLibraryThumbnail(bytes: Uint8Array): Promise<ThumbnailImage> {
  const result = await sharp(bytes).rotate().resize({
    width: LIBRARY_THUMBNAIL_MAX_SIDE,
    height: LIBRARY_THUMBNAIL_MAX_SIDE,
    fit: 'inside',
    withoutEnlargement: true,
  }).webp({ quality: LIBRARY_THUMBNAIL_QUALITY }).toBuffer({ resolveWithObject: true });
  return {
    byteSize: result.data.byteLength,
    bytes: result.data,
    checksumSha256: createHash('sha256').update(result.data).digest('hex'),
    contentType: 'image/webp',
    height: result.info.height ?? null,
    width: result.info.width ?? null,
  };
}
