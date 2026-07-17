import { createHash } from 'node:crypto';
import sharp from 'sharp';
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
  type AssetLibraryFacets,
  type AssetMediaKind,
  type AssetOrigin,
  type AssetRecord,
  type AssetRepository,
  type AssetVariantPurpose,
  type LibraryAssetRecord,
} from './asset-repository';

const DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
const LIBRARY_THUMBNAIL_MAX_SIDE = 560;
const LIBRARY_THUMBNAIL_QUALITY = 82;

export interface AssetDto {
  byteSize: number;
  checksumSha256: string;
  contentType: string;
  contentUrl?: string;
  createdAt: string;
  documentId: string | null;
  generationJobId: string | null;
  height: number | null;
  id: string;
  libraryVisible: boolean;
  mediaKind: AssetMediaKind;
  metadata: Record<string, unknown> | null;
  modelId: string | null;
  operation: string | null;
  origin: AssetOrigin;
  originalName: string;
  provider: string | null;
  status: 'pending' | 'ready' | 'failed';
  thumbnailUrl?: string;
  updatedAt: string;
  width: number | null;
  workspaceId: string;
}

export interface UploadImageAssetInput {
  bytes: Uint8Array;
  claimedContentType?: string | null;
  documentId?: string | null;
  generationJobId?: string | null;
  libraryVisible?: boolean;
  maxBytes: number;
  metadata?: Record<string, unknown> | null;
  modelId?: string | null;
  operation?: string | null;
  origin?: AssetOrigin;
  originalName: string;
  provider?: string | null;
  userId: string;
  workspaceId: string;
}

export interface ListLibraryAssetsInput {
  cursor?: string | null;
  documentIds?: string[];
  limit?: number;
  mediaKinds?: AssetMediaKind[];
  modelIds?: string[];
  origins?: AssetOrigin[];
  providers?: string[];
  search?: string;
  workspaceId: string;
}

export interface LibraryAssetDto extends AssetDto {
  document: {
    id: string;
    name: string;
    status: 'active' | 'trash';
  } | null;
}

export interface LibraryAssetPage {
  facets: AssetLibraryFacets;
  items: LibraryAssetDto[];
  nextCursor: string | null;
}

export interface AssetStorageDependencies {
  createId?(): string;
  createThumbnail?(bytes: Uint8Array): Promise<ThumbnailImage>;
  objectStore: AssetObjectStore;
  repository: AssetRepository;
}

export interface AssetUploadDependencies extends AssetStorageDependencies {
  assertAccess(input: { documentId: string | null; userId: string; workspaceId: string }): Promise<void>;
  bucket: string;
  createId(): string;
}

export interface ThumbnailImage {
  byteSize: number;
  bytes: Uint8Array;
  checksumSha256: string;
  contentType: 'image/webp';
  height: number | null;
  width: number | null;
}

export interface AssetLibraryDependencies {
  assertMembership(userId: string, workspaceId: string): Promise<unknown>;
  repository: AssetRepository;
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

export class AssetProvenanceError extends Error {
  constructor(message = 'Asset provenance is invalid.') {
    super(message);
    this.name = 'AssetProvenanceError';
  }
}

export class AssetLibraryQueryError extends Error {
  constructor(message = 'Library query is invalid.') {
    super(message);
    this.name = 'AssetLibraryQueryError';
  }
}

export function getMaxImageUploadBytes() {
  const parsed = Number.parseInt(process.env.S3_MAX_IMAGE_BYTES ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_IMAGE_UPLOAD_BYTES;
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
  const provenance = normalizeAssetProvenance(input);
  await dependencies.assertAccess({
    documentId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const existingGenerated = input.generationJobId && provenance.origin === 'generated'
    ? await dependencies.repository.findGeneratedByJobId(input.generationJobId)
    : undefined;
  const pending = existingGenerated
    ? await prepareGeneratedAssetRetry(existingGenerated, input, image.checksumSha256, dependencies)
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
    let hasThumbnail = false;
    if (dependencies.createThumbnail) {
      try {
        const thumbnail = await dependencies.createThumbnail(image.buffer);
        await storeThumbnailVariant(ready, thumbnail, dependencies);
        hasThumbnail = true;
      } catch (error) {
        // The original remains usable. Thumbnail generation is an optimization
        // and can be retried/backfilled without failing a successful upload.
        logStorageFailure('thumbnail-create', ready.id, error);
      }
    }
    return toAssetDto(ready, hasThumbnail);
  } catch (error) {
    logStorageFailure('upload', pending.id, error);
    await dependencies.repository.markFailed(pending.id, 'storage_upload_failed').catch((markError: unknown) => {
      logStorageFailure('mark-failed', pending.id, markError);
    });
    throw new AssetStorageError();
  }
}

async function prepareGeneratedAssetRetry(
  existing: AssetRecord,
  input: UploadImageAssetInput,
  checksumSha256: string,
  dependencies: AssetUploadDependencies,
) {
  if (
    existing.workspaceId !== input.workspaceId
    || existing.documentId !== (input.documentId ?? null)
    || existing.createdByUserId !== input.userId
    || existing.generationJobId !== input.generationJobId
    || existing.origin !== 'generated'
    || existing.checksumSha256 !== checksumSha256
  ) {
    throw new AssetProvenanceError('Existing generated asset does not match the retry payload.');
  }
  if (existing.status === 'ready') return existing;
  if (existing.status !== 'pending' && existing.status !== 'failed') {
    throw new AssetStorageError();
  }
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
  const storageKey = createAssetObjectKey({
    assetId,
    documentId,
    extension: image.extension,
    workspaceId: input.workspaceId,
  });
  return dependencies.repository.createPending({
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
    mediaKind: 'image',
    ...provenance,
  });
}

export async function listLibraryAssets(
  userId: string,
  input: ListLibraryAssetsInput,
  dependencies: AssetLibraryDependencies = createDefaultLibraryDependencies(),
): Promise<LibraryAssetPage> {
  await dependencies.assertMembership(userId, input.workspaceId);
  const limit = normalizeLibraryLimit(input.limit);
  const rows = await dependencies.repository.listLibrary({
    userId,
    workspaceId: input.workspaceId,
    cursor: decodeLibraryCursor(input.cursor),
    documentIds: normalizeStringFilters(input.documentIds),
    limit: limit + 1,
    mediaKinds: input.mediaKinds,
    modelIds: normalizeStringFilters(input.modelIds),
    origins: input.origins,
    providers: normalizeStringFilters(input.providers),
    search: normalizeLibrarySearch(input.search),
  });
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  const facets = await dependencies.repository.listLibraryFacets({
    userId,
    workspaceId: input.workspaceId,
  });
  return {
    items: pageRows.map(toLibraryAssetDto),
    nextCursor: hasMore && last
      ? encodeLibraryCursor({ createdAt: last.createdAt, id: last.id })
      : null,
    facets,
  };
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

export async function getGeneratedAssetByJobId(
  generationJobId: string,
  repository: AssetRepository = createDbAssetRepository(),
) {
  const record = await repository.findGeneratedByJobId(generationJobId);
  return record ? toAssetDto(record) : null;
}

export async function getLibraryAssetMetadata(
  userId: string,
  assetId: string,
  repository: AssetRepository = createDbAssetRepository(),
) {
  const record = await requireAccessibleAsset(userId, assetId, repository);
  if (record.status !== 'ready' || !record.libraryVisible) throw new AssetNotFoundError();
  return toAssetDto(record);
}

export async function publishGeneratedAssetToLibrary(
  userId: string,
  assetId: string,
  repository: AssetRepository = createDbAssetRepository(),
) {
  const record = await requireAccessibleAsset(userId, assetId, repository);
  if (record.status !== 'ready' || record.origin !== 'generated') {
    throw new AssetProvenanceError('Only a ready generated asset can be published to Library.');
  }
  const published = await repository.markLibraryVisible(assetId);
  if (!published) throw new AssetStorageError();
  return toAssetDto(published);
}

export async function getAssetContent(
  userId: string,
  assetId: string,
  dependencies: AssetStorageDependencies = createDefaultStorageDependencies(),
  purpose?: AssetVariantPurpose,
) {
  const record = await requireAccessibleAsset(userId, assetId, dependencies.repository);
  if (record.status === 'deleted') throw new AssetNotFoundError();
  if (record.status !== 'ready') throw new AssetNotReadyError();
  let variant = purpose
    ? await dependencies.repository.findVariant(record.id, purpose)
    : undefined;

  try {
    if (
      purpose === 'thumbnail'
      && !variant
      && dependencies.createId
      && dependencies.createThumbnail
    ) {
      const original = await dependencies.objectStore.get({
        bucket: record.bucket,
        key: record.storageKey,
      });
      const bytes = new Uint8Array(await new Response(original.body).arrayBuffer());
      const thumbnail = await dependencies.createThumbnail(bytes);
      await storeThumbnailVariant(record, thumbnail, {
        ...dependencies,
        createId: dependencies.createId,
      });
      variant = await dependencies.repository.findVariant(record.id, purpose);
    }
    if (purpose && !variant) throw new AssetNotFoundError();

    const location = variant ?? record;
    const object = await dependencies.objectStore.get({ bucket: location.bucket, key: location.storageKey });
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
    createThumbnail: createLibraryThumbnail,
    createId: createUuidV7,
    objectStore: getAssetObjectStore(),
    repository: createDbAssetRepository(),
  };
}

function createDefaultStorageDependencies(): AssetStorageDependencies {
  return {
    createId: createUuidV7,
    createThumbnail: createLibraryThumbnail,
    objectStore: getAssetObjectStore(),
    repository: createDbAssetRepository(),
  };
}

function createDefaultLibraryDependencies(): AssetLibraryDependencies {
  return {
    assertMembership: requireWorkspaceMembership,
    repository: createDbAssetRepository(),
  };
}

export function toAssetDto(record: AssetRecord, hasThumbnail = false): AssetDto {
  if (record.status === 'deleted') throw new AssetNotFoundError();
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    generationJobId: record.generationJobId,
    originalName: record.originalName,
    contentType: record.contentType,
    byteSize: record.byteSize,
    width: record.width,
    height: record.height,
    checksumSha256: record.checksumSha256,
    mediaKind: record.mediaKind,
    origin: record.origin,
    libraryVisible: record.libraryVisible,
    provider: record.provider,
    modelId: record.modelId,
    operation: record.operation,
    metadata: record.metadata,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(record.status === 'ready' ? { contentUrl: `/api/assets/${record.id}/content` } : {}),
    ...(record.status === 'ready' && hasThumbnail
      ? { thumbnailUrl: `/api/assets/${record.id}/content?variant=thumbnail` }
      : {}),
  };
}

function toLibraryAssetDto(record: LibraryAssetRecord): LibraryAssetDto {
  return {
    // Older Library records are upgraded lazily on the first thumbnail request.
    ...toAssetDto(record, record.mediaKind === 'image'),
    document: record.documentId && record.documentName && record.documentStatus
      ? {
        id: record.documentId,
        name: record.documentName,
        status: record.documentStatus,
      }
      : null,
  };
}

function normalizeAssetProvenance(input: UploadImageAssetInput) {
  const origin = input.origin ?? 'unknown';
  const libraryVisible = input.libraryVisible ?? false;
  const provider = normalizeOptionalMetadataText(input.provider);
  const modelId = normalizeOptionalMetadataText(input.modelId);
  const generationJobId = input.generationJobId ?? null;
  let operation = normalizeOptionalMetadataText(input.operation);

  if (origin === 'uploaded') {
    operation ??= 'upload';
    if (provider || modelId || generationJobId) {
      throw new AssetProvenanceError('Uploaded assets cannot have generation provenance.');
    }
  }
  if (origin === 'generated' && (!provider || !modelId || !operation || !generationJobId)) {
    throw new AssetProvenanceError(
      'Generated assets require provider, model, operation, and generation job.',
    );
  }
  if (origin === 'saved') operation ??= 'save_to_library';
  if (!libraryVisible && origin !== 'unknown' && origin !== 'generated') {
    throw new AssetProvenanceError('Durable library origins require library visibility.');
  }

  return {
    generationJobId,
    libraryVisible,
    metadata: normalizeMetadata(input.metadata),
    modelId,
    operation,
    origin,
    provider,
  };
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > 32_768) throw new AssetProvenanceError('Asset metadata is too large.');
  return JSON.parse(serialized) as Record<string, unknown>;
}

function normalizeOptionalMetadataText(value: string | null | undefined) {
  const normalized = value?.trim().slice(0, 255);
  return normalized || null;
}

function normalizeLibraryLimit(value?: number) {
  if (value === undefined) return 40;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new AssetLibraryQueryError('Library page size must be between 1 and 100.');
  }
  return value;
}

function normalizeLibrarySearch(value?: string) {
  const normalized = value?.trim().replace(/\s+/g, ' ').slice(0, 120);
  return normalized || undefined;
}

function normalizeStringFilters(values?: string[]) {
  if (!values?.length) return undefined;
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > 50) throw new AssetLibraryQueryError('Too many library filters.');
  return normalized.length ? normalized : undefined;
}

function encodeLibraryCursor(input: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({
    createdAt: input.createdAt.toISOString(),
    id: input.id,
  }), 'utf8').toString('base64url');
}

function decodeLibraryCursor(value?: string | null) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('Malformed cursor.');
    }
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(parsed.id)) {
      throw new Error('Malformed cursor.');
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new AssetLibraryQueryError('Library cursor is invalid.');
  }
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

async function storeThumbnailVariant(
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
    await dependencies.objectStore.delete({
      bucket: record.bucket,
      key: storageKey,
    }).catch((deleteError: unknown) => {
      logStorageFailure('thumbnail-rollback', record.id, deleteError);
    });
    throw error;
  }
}

async function deleteStoredAssetObjects(
  record: AssetRecord,
  dependencies: AssetStorageDependencies,
) {
  const variants = await dependencies.repository.listVariants(record.id);
  for (const variant of variants) {
    await dependencies.objectStore.delete({
      bucket: variant.bucket,
      key: variant.storageKey,
    });
  }
  await dependencies.objectStore.delete({
    bucket: record.bucket,
    key: record.storageKey,
  });
}

function createThumbnailStorageKey(storageKey: string) {
  const extensionIndex = storageKey.lastIndexOf('.');
  const base = extensionIndex > storageKey.lastIndexOf('/')
    ? storageKey.slice(0, extensionIndex)
    : storageKey;
  return `${base}.thumbnail.webp`;
}

async function createLibraryThumbnail(bytes: Uint8Array): Promise<ThumbnailImage> {
  const result = await sharp(bytes)
    .rotate()
    .resize({
      width: LIBRARY_THUMBNAIL_MAX_SIDE,
      height: LIBRARY_THUMBNAIL_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: LIBRARY_THUMBNAIL_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    byteSize: result.data.byteLength,
    bytes: result.data,
    checksumSha256: createHash('sha256').update(result.data).digest('hex'),
    contentType: 'image/webp',
    height: result.info.height ?? null,
    width: result.info.width ?? null,
  };
}

export { AssetValidationError };
