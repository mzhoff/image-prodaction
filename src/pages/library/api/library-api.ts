import type {
  LibraryAssetItem,
  LibraryAssetsResponse,
  LibraryFilters,
} from '../model/types';

interface ApiErrorPayload {
  error?: { message?: string };
}

interface RawLibraryAssetsResponse extends Omit<LibraryAssetsResponse, 'facets'> {
  facets?: {
    documents?: Array<{ count: number; id: string; name: string; status: string }>;
    mediaKinds?: Array<{ count: number; value: string }>;
    models?: Array<{ count: number; modelId: string; provider: string | null }>;
    origins?: Array<{ count: number; value: string }>;
  };
}

export async function fetchLibraryAssets(
  workspaceId: string,
  filters: LibraryFilters,
  cursor?: string | null,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ workspaceId });
  setIfPresent(params, 'origin', filters.origin);
  setIfPresent(params, 'mediaKind', filters.mediaKind);
  setIfPresent(params, 'modelId', filters.modelId);
  setIfPresent(params, 'documentId', filters.documentId);
  setIfPresent(params, 'search', filters.q);
  setIfPresent(params, 'cursor', cursor ?? '');

  const response = await requestJson<RawLibraryAssetsResponse>(
    `/api/assets?${params.toString()}`,
    { signal },
  );
  return {
    ...response,
    facets: normalizeFacets(response.facets),
  } satisfies LibraryAssetsResponse;
}

export async function fetchLibraryAsset(assetId: string, signal?: AbortSignal) {
  const payload = await requestJson<{ asset?: Partial<LibraryAssetItem> & { documentId?: string | null } }>(
    `/api/assets/${encodeURIComponent(assetId)}?view=library`,
    { signal },
  );
  const item = payload.asset;
  if (!item?.id || !item.contentUrl) return null;

  return {
    id: item.id,
    workspaceId: item.workspaceId ?? '',
    document: item.document ?? (item.documentId
      ? { id: item.documentId, name: 'Документ', status: 'active' }
      : null),
    originalName: item.originalName ?? 'Untitled asset',
    contentType: item.contentType ?? 'application/octet-stream',
    mediaKind: item.mediaKind ?? inferMediaKind(item.contentType),
    origin: item.origin ?? 'unknown',
    provider: item.provider ?? null,
    modelId: item.modelId ?? null,
    operation: item.operation ?? null,
    width: item.width ?? null,
    height: item.height ?? null,
    createdAt: item.createdAt ?? new Date(0).toISOString(),
    contentUrl: item.contentUrl,
    thumbnailUrl: item.thumbnailUrl ?? null,
  } satisfies LibraryAssetItem;
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, { cache: 'no-store', ...init });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
    throw new Error(payload?.error?.message || `Request failed with status ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function setIfPresent(params: URLSearchParams, key: string, value: string) {
  const normalized = value.trim();
  if (normalized) params.set(key, normalized);
}

function inferMediaKind(contentType?: string): LibraryAssetItem['mediaKind'] {
  if (contentType?.startsWith('video/')) return 'video';
  return 'image';
}

function normalizeFacets(facets: RawLibraryAssetsResponse['facets']) {
  if (!facets) return {};
  return {
    origins: facets.origins?.map((item) => ({
      value: item.value,
      label: originLabel(item.value),
      count: item.count,
    })),
    mediaKinds: facets.mediaKinds?.map((item) => ({
      value: item.value,
      label: mediaKindLabel(item.value),
      count: item.count,
    })),
    models: facets.models?.map((item) => ({
      value: item.modelId,
      label: item.provider ? `${item.modelId} · ${item.provider}` : item.modelId,
      count: item.count,
    })),
    documents: facets.documents?.map((item) => ({
      value: item.id,
      label: item.name,
      count: item.count,
    })),
  } satisfies LibraryAssetsResponse['facets'];
}

function originLabel(value: string) {
  if (value === 'uploaded') return 'Загруженные';
  if (value === 'generated') return 'Сгенерированные';
  if (value === 'saved') return 'Сохранённые';
  return 'Без источника';
}

function mediaKindLabel(value: string) {
  if (value === 'image') return 'Изображения';
  if (value === 'video') return 'Видео';
  return value;
}
