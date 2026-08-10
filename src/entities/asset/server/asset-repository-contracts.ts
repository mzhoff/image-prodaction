import { asset, assetVariant } from '@/shared/db/schema/asset';

export type AssetRecord = typeof asset.$inferSelect;
export type AssetMediaKind = AssetRecord['mediaKind'];
export type AssetOrigin = AssetRecord['origin'];
export type AssetVariantRecord = typeof assetVariant.$inferSelect;
export type AssetVariantPurpose = AssetVariantRecord['purpose'];

export interface AssetLibraryCursor {
  createdAt: Date;
  id: string;
}

export interface AssetLibraryFilters {
  cursor?: AssetLibraryCursor;
  documentIds?: string[];
  limit: number;
  mediaKinds?: AssetMediaKind[];
  modelIds?: string[];
  origins?: AssetOrigin[];
  providers?: string[];
  search?: string;
  userId: string;
  workspaceId: string;
}

export type LibraryAssetRecord = AssetRecord & {
  documentName: string | null;
  documentStatus: 'active' | 'trash' | null;
  thumbnailVariantId: string | null;
};

export interface AssetLibraryFacets {
  documents: Array<{ count: number; id: string; name: string; status: 'active' | 'trash' }>;
  mediaKinds: Array<{ count: number; value: AssetMediaKind }>;
  models: Array<{ count: number; modelId: string; provider: string | null }>;
  origins: Array<{ count: number; value: AssetOrigin }>;
  providers: Array<{ count: number; value: string }>;
}

export interface PendingAssetInput {
  bucket: string;
  byteSize: number;
  checksumSha256: string;
  contentType: string;
  createdByUserId: string;
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
  storageKey: string;
  width: number | null;
  workspaceId: string;
}

export interface AssetVariantInput {
  assetId: string;
  bucket: string;
  byteSize: number;
  checksumSha256: string;
  contentType: string;
  height: number | null;
  id: string;
  purpose: AssetVariantPurpose;
  storageKey: string;
  width: number | null;
}

export interface AssetRepository {
  createPending(input: PendingAssetInput): Promise<AssetRecord>;
  findAccessible(assetId: string, userId: string): Promise<AssetRecord | undefined>;
  findCleanupCandidates(before: Date, limit: number): Promise<AssetRecord[]>;
  findGeneratedByJobId(generationJobId: string): Promise<AssetRecord | undefined>;
  findVariant(assetId: string, purpose: AssetVariantPurpose): Promise<AssetVariantRecord | undefined>;
  listLibrary(input: AssetLibraryFilters): Promise<LibraryAssetRecord[]>;
  listLibraryFacets(input: { userId: string; workspaceId: string }): Promise<AssetLibraryFacets>;
  listByDocument(documentId: string): Promise<AssetRecord[]>;
  listVariants(assetId: string): Promise<AssetVariantRecord[]>;
  markLibraryVisible(assetId: string): Promise<AssetRecord | undefined>;
  markDeleted(assetId: string, deletedAt: Date): Promise<void>;
  markFailed(assetId: string, errorCode: string): Promise<void>;
  markReady(assetId: string): Promise<AssetRecord>;
  resetPending(assetId: string): Promise<AssetRecord>;
  upsertVariant(input: AssetVariantInput): Promise<AssetVariantRecord>;
}
