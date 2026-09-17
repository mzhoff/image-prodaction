import type { LibraryFilters } from './types';

export const emptyLibraryFilters: LibraryFilters = {
  folderId: '',
  origin: '',
  mediaKind: '',
  modelId: '',
  documentId: '',
  q: '',
};

export function readLibraryFilters(searchParams: URLSearchParams): LibraryFilters {
  return {
    folderId: searchParams.get('folderId')?.trim() ?? '',
    origin: searchParams.get('origin')?.trim() ?? '',
    mediaKind: searchParams.get('mediaKind')?.trim() ?? '',
    modelId: searchParams.get('modelId')?.trim() ?? '',
    documentId: searchParams.get('documentId')?.trim() ?? '',
    q: searchParams.get('q')?.trim() ?? '',
  };
}

export function writeLibraryFilters(filters: LibraryFilters) {
  const params = new URLSearchParams();
  setIfPresent(params, 'folderId', filters.folderId ?? '');
  setIfPresent(params, 'origin', filters.origin);
  setIfPresent(params, 'mediaKind', filters.mediaKind);
  setIfPresent(params, 'modelId', filters.modelId);
  setIfPresent(params, 'documentId', filters.documentId);
  setIfPresent(params, 'q', filters.q);
  return params.toString();
}

export function hasLibraryFilters(filters: LibraryFilters) {
  return Object.values(filters).some(Boolean);
}

function setIfPresent(params: URLSearchParams, key: string, value: string) {
  const normalized = value.trim();
  if (normalized) params.set(key, normalized);
}
