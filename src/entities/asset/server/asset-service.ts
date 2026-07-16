import { getDocument } from '@/entities/document/server/document-service';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { createUuidV7 } from '@/shared/lib/id';
import { AssetValidationError, validateImageBytes } from '@/shared/storage/image-policy';
import {
  createAssetObjectKey,
  getAssetObjectStore,
  getConfiguredAssetBucket,
  type AssetObjectStore,
} from '@/shared/storage/s3-assets';
import {
  createDbAssetRepository,
  type AssetRecord,
  type AssetRepository,
} from './asset-repository';

export interface AssetDto {
  byteSize: number;
  checksumSha256: string;
  contentType: string;
  contentUrl?: string;
  createdAt: string;
  documentId: string | null;
  height: number | null;
  id: string;
  originalName: string;
  status: 'pending' | 'ready' | 'failed';
  updatedAt: string;
  width: number | null;
  workspaceId: string;
}

export interface UploadImageAssetInput {
  bytes: Uint8Array;
  claimedContentType?: string | null;
  documentId?: string | null;
  maxBytes: number;
  originalName: string;
  userId: string;
  workspaceId: string;
}

export interface AssetStorageDependencies {
  objectStore: AssetObjectStore;
  repository: AssetRepository;
}

export interface AssetUploadDependencies extends AssetStorageDependencies {
  assertAccess(input: { documentId: string | null; userId: string; workspaceId: string }): Promise<void>;
  bucket: string;
  createId(): string;
}

export class AssetNotFoundError extends Error {
  constructor() {
    super('Asset not found.');
    this.name = 'AssetNotFoundError';
  }
}

export class AssetNotReadyError extends Error {
  constructor() {
    super('Asset content is not ready.');
    this.name = 'AssetNotReadyError';
  }
}

export class AssetDocumentWorkspaceMismatchError extends Error {
  constructor() {
    super('Document does not belong to the selected workspace.');
    this.name = 'AssetDocumentWorkspaceMismatchError';
  }
}

export class AssetStorageError extends Error {
  constructor() {
    super('Asset storage is temporarily unavailable.');
    this.name = 'AssetStorageError';
  }
}

export async function uploadImageAsset(
  input: UploadImageAssetInput,
  dependencies: AssetUploadDependencies = createDefaultUploadDependencies(),
) {
  const image = validateImageBytes(input.bytes, {
    claimedContentType: input.claimedContentType,
    maxBytes: input.maxBytes,
  });
  const documentId = input.documentId ?? null;
  await dependencies.assertAccess({
    documentId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const assetId = dependencies.createId();
  const storageKey = createAssetObjectKey({
    assetId,
    documentId,
    extension: image.extension,
    workspaceId: input.workspaceId,
  });
  const pending = await dependencies.repository.createPending({
    id: assetId,
    workspaceId: input.workspaceId,
    documentId,
    createdByUserId: input.userId,
    bucket: dependencies.bucket,
    storageKey,
    originalName: normalizeOriginalName(input.originalName, image.extension),
    contentType: image.contentType,
    byteSize: image.byteSize,
    width: image.width ?? null,
    height: image.height ?? null,
    checksumSha256: image.checksumSha256,
  });

  try {
    await dependencies.objectStore.put({
      bucket: pending.bucket,
      key: pending.storageKey,
      body: image.buffer,
      contentType: image.contentType,
    });
    return toAssetDto(await dependencies.repository.markReady(pending.id));
  } catch (error) {
    logStorageFailure('upload', pending.id, error);
    await dependencies.repository.markFailed(pending.id, 'storage_upload_failed').catch((markError: unknown) => {
      logStorageFailure('mark-failed', pending.id, markError);
    });
    throw new AssetStorageError();
  }
}

export async function getAssetMetadata(
  userId: string,
  assetId: string,
  repository: AssetRepository = createDbAssetRepository(),
) {
  const record = await requireAccessibleAsset(userId, assetId, repository);
  if (record.status === 'deleted') throw new AssetNotFoundError();
  return toAssetDto(record);
}

export async function getAssetContent(
  userId: string,
  assetId: string,
  dependencies: AssetStorageDependencies = createDefaultStorageDependencies(),
) {
  const record = await requireAccessibleAsset(userId, assetId, dependencies.repository);
  if (record.status === 'deleted') throw new AssetNotFoundError();
  if (record.status !== 'ready') throw new AssetNotReadyError();

  try {
    const object = await dependencies.objectStore.get({ bucket: record.bucket, key: record.storageKey });
    return { asset: toAssetDto(record), object };
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
    await dependencies.objectStore.delete({ bucket: record.bucket, key: record.storageKey });
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
      await dependencies.objectStore.delete({ bucket: record.bucket, key: record.storageKey });
      await dependencies.repository.markDeleted(record.id, new Date());
      deleted += 1;
    } catch (error) {
      failed += 1;
      logStorageFailure('orphan-cleanup', record.id, error);
    }
  }

  return { scanned: candidates.length, deleted, failed };
}

/**
 * Internal precondition for permanent document deletion.
 * The caller must authorize the document first and must not delete it if this throws.
 */
export async function cleanupDocumentAssets(
  documentId: string,
  dependencies: AssetStorageDependencies = createDefaultStorageDependencies(),
) {
  const records = await dependencies.repository.listByDocument(documentId);
  let deleted = 0;

  for (const record of records) {
    try {
      await dependencies.objectStore.delete({ bucket: record.bucket, key: record.storageKey });
    } catch (error) {
      logStorageFailure('document-cleanup', record.id, error);
      throw new AssetStorageError();
    }
    await dependencies.repository.markDeleted(record.id, new Date());
    deleted += 1;
  }

  return { scanned: records.length, deleted };
}

async function requireAccessibleAsset(userId: string, assetId: string, repository: AssetRepository) {
  const record = await repository.findAccessible(assetId, userId);
  if (!record) throw new AssetNotFoundError();
  return record;
}

async function assertUploadAccess(input: { documentId: string | null; userId: string; workspaceId: string }) {
  await requireWorkspaceMembership(input.userId, input.workspaceId);
  if (!input.documentId) return;
  const targetDocument = await getDocument(input.userId, input.documentId);
  if (targetDocument.workspaceId !== input.workspaceId) throw new AssetDocumentWorkspaceMismatchError();
}

function createDefaultUploadDependencies(): AssetUploadDependencies {
  return {
    assertAccess: assertUploadAccess,
    bucket: getConfiguredAssetBucket(),
    createId: createUuidV7,
    objectStore: getAssetObjectStore(),
    repository: createDbAssetRepository(),
  };
}

function createDefaultStorageDependencies(): AssetStorageDependencies {
  return {
    objectStore: getAssetObjectStore(),
    repository: createDbAssetRepository(),
  };
}

function toAssetDto(record: AssetRecord): AssetDto {
  if (record.status === 'deleted') throw new AssetNotFoundError();
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    originalName: record.originalName,
    contentType: record.contentType,
    byteSize: record.byteSize,
    width: record.width,
    height: record.height,
    checksumSha256: record.checksumSha256,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(record.status === 'ready' ? { contentUrl: `/api/assets/${record.id}/content` } : {}),
  };
}

function normalizeOriginalName(value: string, extension: string) {
  const leafName = value.replace(/\\/g, '/').split('/').pop() ?? '';
  const normalized = leafName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  return normalized || `image.${extension}`;
}

function logStorageFailure(operation: string, assetId: string, error: unknown) {
  console.error('Asset storage operation failed', {
    operation,
    assetId,
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
}

export { AssetValidationError };
