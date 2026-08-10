import { and, eq, ilike, inArray, lt, or, type SQL } from 'drizzle-orm';
import type { AssetLibraryFilters } from './asset-repository-contracts';
import { asset } from '@/shared/db/schema/asset';

export function createLibraryConditions(input: AssetLibraryFilters): SQL[] {
  const conditions: SQL[] = [
    eq(asset.workspaceId, input.workspaceId),
    eq(asset.libraryVisible, true),
    eq(asset.status, 'ready'),
  ];
  if (input.origins?.length) conditions.push(inArray(asset.origin, input.origins));
  if (input.mediaKinds?.length) conditions.push(inArray(asset.mediaKind, input.mediaKinds));
  if (input.providers?.length) conditions.push(inArray(asset.provider, input.providers));
  if (input.modelIds?.length) conditions.push(inArray(asset.modelId, input.modelIds));
  if (input.documentIds?.length) conditions.push(inArray(asset.documentId, input.documentIds));
  if (input.search) {
    const pattern = `%${input.search}%`;
    const searchCondition = or(
      ilike(asset.originalName, pattern),
      ilike(asset.modelId, pattern),
      ilike(asset.provider, pattern),
      ilike(asset.operation, pattern),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (input.cursor) {
    const cursorCondition = or(
      lt(asset.createdAt, input.cursor.createdAt),
      and(eq(asset.createdAt, input.cursor.createdAt), lt(asset.id, input.cursor.id)),
    );
    if (cursorCondition) conditions.push(cursorCondition);
  }
  return conditions;
}

export const assetSelect = {
  id: asset.id,
  workspaceId: asset.workspaceId,
  documentId: asset.documentId,
  createdByUserId: asset.createdByUserId,
  bucket: asset.bucket,
  storageKey: asset.storageKey,
  originalName: asset.originalName,
  contentType: asset.contentType,
  byteSize: asset.byteSize,
  width: asset.width,
  height: asset.height,
  checksumSha256: asset.checksumSha256,
  mediaKind: asset.mediaKind,
  origin: asset.origin,
  libraryVisible: asset.libraryVisible,
  provider: asset.provider,
  modelId: asset.modelId,
  operation: asset.operation,
  metadata: asset.metadata,
  generationJobId: asset.generationJobId,
  status: asset.status,
  errorCode: asset.errorCode,
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
  deletedAt: asset.deletedAt,
};
