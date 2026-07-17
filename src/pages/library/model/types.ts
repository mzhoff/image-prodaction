export type LibraryAssetOrigin = 'uploaded' | 'generated' | 'saved' | 'unknown';
export type LibraryMediaKind = 'image' | 'video';

export interface LibraryDocumentSummary {
  id: string;
  name: string;
  status: string;
}

export interface LibraryAssetItem {
  id: string;
  workspaceId: string;
  document: LibraryDocumentSummary | null;
  originalName: string;
  contentType: string;
  mediaKind: LibraryMediaKind;
  origin: LibraryAssetOrigin;
  provider: string | null;
  modelId: string | null;
  operation: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  contentUrl: string;
  thumbnailUrl?: string | null;
}

export interface LibraryFacetOption {
  value: string;
  label: string;
  count?: number;
}

export interface LibraryFacets {
  origins?: LibraryFacetOption[];
  mediaKinds?: LibraryFacetOption[];
  models?: LibraryFacetOption[];
  documents?: LibraryFacetOption[];
}

export interface LibraryAssetsResponse {
  items: LibraryAssetItem[];
  nextCursor: string | null;
  facets?: LibraryFacets;
}

export interface LibraryFilters {
  origin: string;
  mediaKind: string;
  modelId: string;
  documentId: string;
  q: string;
}
