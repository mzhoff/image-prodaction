import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import { uploadRemoteImageAsset, type ActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { videoRequestSchema, type VideoGenerationRequest } from '@/shared/media/video-generation-contracts';

interface ImagePreparation {
  read: (asset: AssetRecord) => Promise<Blob | null>;
  upload: (file: File, scope: ActiveAssetScope, signal: AbortSignal) => Promise<AssetRecord>;
}
const defaults: ImagePreparation = {
  read: loadAssetBlob,
  upload: (file, scope, signal) => uploadRemoteImageAsset(file, scope, 'uploaded',
    (input, init) => fetch(input, { ...init, signal })),
};

/** Preserve the exact graph output (not its thumbnail or upstream original).
 * One explicit Generate click prepares at most three distinct full-size files.
 * Only the resulting server IDs may enter the persisted paid request/retry.
 */
export async function prepareVideoImages(
  draft: VideoGenerationRequest,
  assets: readonly AssetRecord[],
  scope: ActiveAssetScope,
  signal: AbortSignal,
  io: ImagePreparation = defaults,
) {
  const request = structuredClone(draft);
  const inputs = [request.firstFrame, request.lastFrame, ...request.references].filter((item) => item !== undefined);
  const ids = [...new Set(inputs.map((item) => item.assetId))];
  const selected = ids.map((id) => {
    const asset = assets.find((item) => item.id === id);
    if (!asset || asset.kind !== 'image') throw new Error('Входное изображение недоступно. Проверьте подключённую ноду.');
    return asset;
  });
  signal.throwIfAborted();
  // Read all local bytes before uploading anything: a missing file must not
  // silently fall back to the source image or send a partial video request.
  const files = await Promise.all(selected.map(async (asset) => {
    if (asset.storage.type === 'remote') return undefined;
    const blob = await io.read(asset);
    signal.throwIfAborted();
    if (!blob?.size) throw new Error('Не удалось прочитать обработанное изображение. Дождитесь его повторной подготовки в Crop или Export.');
    return new File([blob], asset.name, { type: blob.type || asset.mimeType });
  }));
  signal.throwIfAborted();
  const uploaded = await Promise.all(selected.map(async (asset, index) => {
    signal.throwIfAborted();
    return files[index] ? io.upload(files[index], scope, signal) : asset;
  }));
  signal.throwIfAborted();
  const remoteIds = new Map(uploaded.map((asset, index) => {
    if (asset.kind !== 'image' || asset.storage.type !== 'remote') throw new Error('Сервер не подтвердил сохранение изображения.');
    return [ids[index], asset.storage.assetId];
  }));
  for (const input of inputs) input.assetId = remoteIds.get(input.assetId)!;
  return { request: videoRequestSchema.parse(request), uploadedAssets: uploaded.filter((_, index) => files[index] !== undefined) };
}
