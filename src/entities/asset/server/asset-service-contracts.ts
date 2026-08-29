import type {
  AssetLibraryFacets,
  AssetMediaKind,
  AssetOrigin,
  AssetRepository,
} from './asset-repository';
import type { AssetObjectStore } from '@/shared/storage/s3-assets';

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
  /**
   * Server-owned stable id for retry-safe deterministic transforms.
   * Browser upload routes must never accept this value from a request.
   */
  requestedAssetId?: string;
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
  document: { id: string; name: string; status: 'active' | 'trash' } | null;
}

export interface LibraryAssetPage {
  facets: AssetLibraryFacets;
  items: LibraryAssetDto[];
  nextCursor: string | null;
}

export interface ThumbnailImage {
  byteSize: number;
  bytes: Uint8Array;
  checksumSha256: string;
  contentType: 'image/webp';
  height: number | null;
  width: number | null;
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

export interface AssetLibraryDependencies {
  assertMembership(userId: string, workspaceId: string): Promise<unknown>;
  repository: AssetRepository;
}

export class AssetNotFoundError extends Error {
  constructor() { super('Asset not found.'); this.name = 'AssetNotFoundError'; }
}

export class AssetNotReadyError extends Error {
  constructor() { super('Asset content is not ready.'); this.name = 'AssetNotReadyError'; }
}

export class AssetDocumentWorkspaceMismatchError extends Error {
  constructor() { super('Document does not belong to the selected workspace.'); this.name = 'AssetDocumentWorkspaceMismatchError'; }
}

export class AssetStorageError extends Error {
  constructor() { super('Asset storage is temporarily unavailable.'); this.name = 'AssetStorageError'; }
}

export class AssetProvenanceError extends Error {
  constructor(message = 'Asset provenance is invalid.') { super(message); this.name = 'AssetProvenanceError'; }
}

export class AssetLibraryQueryError extends Error {
  constructor(message = 'Library query is invalid.') { super(message); this.name = 'AssetLibraryQueryError'; }
}
