import { createDbAssetRepository, type AssetRepository } from './asset-repository';
import { toAssetDto, toLibraryAssetDto } from './asset-dto';
import {
  decodeLibraryCursor,
  encodeLibraryCursor,
  normalizeLibraryLimit,
  normalizeLibrarySearch,
  normalizeStringFilters,
} from './asset-normalization';
import {
  AssetNotFoundError,
  AssetProvenanceError,
  AssetStorageError,
  type AssetLibraryDependencies,
  type LibraryAssetPage,
  type ListLibraryAssetsInput,
} from './asset-service-contracts';
import { createDefaultLibraryDependencies, requireAccessibleAsset } from './asset-storage-support';

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
  const facets = await dependencies.repository.listLibraryFacets({ userId, workspaceId: input.workspaceId });
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
