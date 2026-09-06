import { z } from 'zod';
import { isUuidV7 } from '@/shared/lib/id';
import { mapRemoteImageAsset } from '../lib/remote-asset';
import { filterNodeTemplateAssetIds, getNodeTemplateAssetIds, type NodeTemplateSnapshot } from '../model/node-template-preset';

const metadataSchema = z.object({ asset: z.object({
  id: z.string(), workspaceId: z.string(), status: z.string(), mediaKind: z.string(),
  originalName: z.string(), contentType: z.string(), createdAt: z.string(),
  width: z.number().nullable(), height: z.number().nullable(),
}) });
type FetchAsset = (input: string, init: RequestInit) => Promise<Response>;

/** Recheck access on insertion; saved references alone cannot render in another document. */
export async function hydrateNodeTemplateAssets(
  snapshot: NodeTemplateSnapshot,
  workspaceId: string,
  signal?: AbortSignal,
  request: FetchAsset = fetch,
) {
  signal?.throwIfAborted();
  const ids = getNodeTemplateAssetIds(snapshot);
  if (ids.length > 50) throw new Error('Template contains too many asset references.');
  const candidates = await Promise.all(ids.map(async (assetId) => {
    if (!isUuidV7(assetId)) return null;
    const response = await request(`/api/assets/${encodeURIComponent(assetId)}`, {
      cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal,
    });
    if (response.status === 403 || response.status === 404 || response.status === 410) return null;
    if (!response.ok) throw new Error('Could not load template images. Try adding the template again.');
    const parsed = metadataSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('The image metadata response is invalid.');
    const asset = parsed.data.asset;
    if (asset.id !== assetId || asset.workspaceId !== workspaceId
      || asset.status !== 'ready' || asset.mediaKind !== 'image') return null;
    return mapRemoteImageAsset(asset);
  }));
  const assets = candidates.filter((asset) => asset !== null);
  signal?.throwIfAborted();
  const allowed = new Set(assets.map((asset) => asset.id));
  return { assets, snapshot: filterNodeTemplateAssetIds(snapshot, allowed),
    strippedAssetReferenceCount: ids.length - assets.length };
}
