import type { AssetRecord } from '../model/types';

export interface ActiveAssetScope {
  documentId: string;
  workspaceId: string;
}

interface UploadedAssetDto {
  contentType: string;
  createdAt: string;
  height: number | null;
  id: string;
  originalName: string;
  width: number | null;
}

interface AssetApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

type FetchAsset = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const REMOTE_IMAGE_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

let activeScope: ActiveAssetScope | undefined;

export class AssetClientError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(status: number, payload?: AssetApiErrorPayload | null) {
    super(payload?.error?.message || `Asset request failed with status ${status}.`);
    this.name = 'AssetClientError';
    this.status = status;
    this.code = payload?.error?.code;
  }
}

export function activateAssetScope(scope: ActiveAssetScope) {
  const activated = { ...scope };
  activeScope = activated;

  return () => {
    if (activeScope === activated) activeScope = undefined;
  };
}

export function getActiveAssetScope() {
  return activeScope ? { ...activeScope } : undefined;
}

export function isRemoteImageMimeType(mimeType: string) {
  return REMOTE_IMAGE_MIME_TYPES.has(mimeType.split(';')[0].trim().toLowerCase());
}

export async function uploadRemoteImageAsset(
  file: File,
  scope: ActiveAssetScope,
  fetchAsset: FetchAsset = fetch,
): Promise<AssetRecord> {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('documentId', scope.documentId);
  formData.set('workspaceId', scope.workspaceId);

  const response = await fetchAsset('/api/assets/images', {
    method: 'POST',
    credentials: 'same-origin',
    body: formData,
  });
  const payload = await response.json().catch(() => null) as { asset?: UploadedAssetDto } & AssetApiErrorPayload | null;
  if (!response.ok || !payload?.asset) throw new AssetClientError(response.status, payload);
  return mapUploadedImageAsset(payload.asset);
}

export function mapUploadedImageAsset(asset: UploadedAssetDto): AssetRecord {
  return {
    id: asset.id,
    kind: 'image',
    name: asset.originalName,
    mimeType: asset.contentType,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    createdAt: asset.createdAt,
    storage: {
      type: 'remote',
      assetId: asset.id,
    },
  };
}

export function getRemoteAssetContentUrl(assetId: string) {
  return `/api/assets/${encodeURIComponent(assetId)}/content`;
}

export async function loadRemoteAssetBlob(assetId: string, fetchAsset: FetchAsset = fetch) {
  const response = await fetchAsset(getRemoteAssetContentUrl(assetId), {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new AssetClientError(response.status, await readErrorPayload(response));
  return response.blob();
}

export async function deleteRemoteAsset(assetId: string, fetchAsset: FetchAsset = fetch) {
  const response = await fetchAsset(`/api/assets/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new AssetClientError(response.status, await readErrorPayload(response));
}

async function readErrorPayload(response: Response) {
  return response.json().catch(() => null) as Promise<AssetApiErrorPayload | null>;
}
