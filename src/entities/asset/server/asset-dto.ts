import type { AssetRecord, LibraryAssetRecord } from './asset-repository';
import { AssetNotFoundError, type AssetDto, type LibraryAssetDto } from './asset-service-contracts';

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

export function toLibraryAssetDto(record: LibraryAssetRecord): LibraryAssetDto {
  return {
    // Older Library records are upgraded lazily on the first thumbnail request.
    ...toAssetDto(record, record.mediaKind === 'image'),
    document: record.documentId && record.documentName && record.documentStatus
      ? { id: record.documentId, name: record.documentName, status: record.documentStatus }
      : null,
  };
}
