import type {
  FavoriteNodePreset,
} from '@/entities/production-graph/model/favorite-node-preset';
import type { ProductionNode } from '@/entities/production-graph/model/types';

interface ApiErrorPayload {
  error?: { message?: string };
}

export async function fetchFavoriteNodes(workspaceId: string, signal?: AbortSignal) {
  return requestJson<{ favorites: FavoriteNodePreset[] }>(
    `/api/node-favorites?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: 'no-store', signal },
  ).then((result) => result.favorites);
}

export async function saveFavoriteNodePreset(
  workspaceId: string,
  node: Pick<ProductionNode, 'data' | 'type'>,
) {
  return requestJson<{
    favorite: FavoriteNodePreset;
    strippedAssetReferenceCount: number;
  }>('/api/node-favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, node }),
  });
}

export async function deleteFavoriteNodePreset(workspaceId: string, favoriteId: string) {
  const response = await fetch(
    `/api/node-favorites/${encodeURIComponent(favoriteId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw await createResponseError(response);
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) throw await createResponseError(response);
  return response.json() as Promise<T>;
}

async function createResponseError(response: Response) {
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  return new Error(payload?.error?.message || `Request failed with status ${response.status}.`);
}
