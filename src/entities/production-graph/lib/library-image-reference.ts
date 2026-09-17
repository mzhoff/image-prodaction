import { z } from 'zod';
import { isUuidV7 } from '@/shared/lib/id';
import { getRemoteAssetContentUrl, isRemoteImageMimeType, mapRemoteImageAsset } from './remote-asset';

/** A stable authenticated application URL, never an expiring S3 URL or an access token. */
export function createLibraryImageLink(assetId: string, origin: string) {
  if (!isUuidV7(assetId)) throw new Error('Некорректный идентификатор изображения.');
  return new URL(getRemoteAssetContentUrl(assetId), origin).href;
}

export function readLibraryImageLink(text: string, origin: string): string | null {
  if (text.length > 2048) return null;
  try {
    const url = new URL(text.trim());
    if (url.origin !== new URL(origin).origin || url.username || url.password || url.search || url.hash) return null;
    const id = /^\/api\/assets\/([^/]+)\/content$/.exec(url.pathname)?.[1];
    return isUuidV7(id) ? id : null;
  } catch { return null; }
}

const metadataSchema = z.object({ asset: z.object({
  id: z.string(), workspaceId: z.string(), status: z.literal('ready'),
  libraryVisible: z.literal(true), mediaKind: z.literal('image'),
  contentType: z.string(), originalName: z.string(), createdAt: z.string(),
  width: z.number().positive().nullable(), height: z.number().positive().nullable(),
}) });

export async function loadLibraryImageReference(
  assetId: string,
  workspaceId: string,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
) {
  if (!isUuidV7(assetId)) throw new Error('Некорректная ссылка на изображение.');
  const response = await request(`/api/assets/${encodeURIComponent(assetId)}?view=library`, {
    credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
  });
  if (!response.ok) throw new Error('Изображение недоступно. Проверьте вход в аккаунт и доступ к библиотеке.');
  const parsed = metadataSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.asset.id !== assetId
    || parsed.data.asset.workspaceId !== workspaceId
    || !isRemoteImageMimeType(parsed.data.asset.contentType)) {
    throw new Error('Можно вставить только доступное изображение из библиотеки этого рабочего пространства.');
  }
  return mapRemoteImageAsset(parsed.data.asset);
}

export function createLibraryProjectLink(projectId: string, assetId: string, requestId: string) {
  if (![projectId, assetId, requestId].every(isUuidV7)) throw new Error('Некорректные данные импорта.');
  return `/projects/${projectId}?${new URLSearchParams({ importAsset: assetId, importRequest: requestId })}`;
}

export function createLibraryProjectBatchLink(projectId: string, assetIds: string[], requestId: string) {
  if (!assetIds.length || assetIds.length > 100 || ![projectId, requestId, ...assetIds].every(isUuidV7)) throw new Error('Некорректные данные импорта.');
  const params = new URLSearchParams({ importRequest: requestId });
  for (const id of new Set(assetIds)) params.append('importAsset', id);
  return `/projects/${projectId}?${params}`;
}

export function readLibraryProjectImports(search: string) {
  const params = new URLSearchParams(search);
  const ids = [...new Set(params.getAll('importAsset'))];
  const requestId = params.get('importRequest');
  if (!ids.length || ids.length > 100 || !ids.every(isUuidV7) || !isUuidV7(requestId)) return null;
  return ids.map((assetId, index) => ({ assetId, nodeId: `library-import-${requestId}${index ? `-${index}` : ''}` }));
}

export function readLibraryProjectImport(search: string) {
  const params = new URLSearchParams(search);
  const assetId = params.get('importAsset');
  const requestId = params.get('importRequest');
  return isUuidV7(assetId) && isUuidV7(requestId) ? { assetId, nodeId: `library-import-${requestId}` } : null;
}
