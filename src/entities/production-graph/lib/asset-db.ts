import type { AssetRecord } from '../model/types';
import { normalizeImageFileForStorage } from '@/shared/lib/normalize-image-file';

interface SaveAssetBlobOptions {
  kind?: AssetRecord['kind'];
  name?: string;
  mimeType?: string;
}

export async function saveAssetBlob(blob: Blob, options: SaveAssetBlobOptions = {}): Promise<AssetRecord> {
  const kind = options.kind ?? inferAssetKind(options.mimeType ?? blob.type);
  if (kind !== 'image') throw new Error('Only image assets can be saved to S3 in this client flow.');
  const name = options.name ?? (blob instanceof File ? blob.name : `${kind}-${Date.now()}`);
  const mimeType = options.mimeType || blob.type || defaultMimeType(kind);
  const file = blob instanceof File && blob.name === name && blob.type === mimeType
    ? blob
    : new File([blob], name, { type: mimeType });

  return uploadAssetFile(file, kind);
}

export async function saveImageAsset(file: File): Promise<AssetRecord> {
  const normalizedFile = await normalizeImageFileForStorage(file);
  return uploadAssetFile(normalizedFile, 'image');
}

export async function loadAssetBlob(asset: AssetRecord) {
  const response = await fetch(asset.storage.publicUrl);
  if (!response.ok) throw new Error(`Не удалось прочитать S3 asset: ${response.status}`);
  return response.blob();
}

export async function deleteAssetBlob(asset: AssetRecord) {
  await fetch('/api/assets/images', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucket: asset.storage.bucket,
      key: asset.storage.key,
    }),
  }).catch(() => undefined);
}

async function uploadAssetFile(file: File, kind: AssetRecord['kind']) {
  const body = new FormData();
  body.set('file', file);
  body.set('kind', kind);

  const response = await fetch('/api/assets/images', {
    method: 'POST',
    body,
  });
  const result = await response.json() as { asset?: AssetRecord; error?: unknown };
  if (!response.ok) throw new Error(formatUploadError(result.error));
  if (!result.asset) throw new Error('S3 upload did not return an asset record.');
  return result.asset;
}

function inferAssetKind(mimeType?: string): AssetRecord['kind'] {
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  return 'image';
}

function defaultMimeType(kind: AssetRecord['kind']) {
  if (kind === 'video') return 'video/mp4';
  if (kind === 'audio') return 'audio/mpeg';
  return 'image/png';
}

function formatUploadError(error: unknown) {
  if (typeof error === 'string') return error;
  if (!error) return 'S3 upload failed.';
  return JSON.stringify(error).slice(0, 500);
}
