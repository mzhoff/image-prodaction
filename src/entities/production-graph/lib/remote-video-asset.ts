import { awaitAssetUpload } from '@/shared/api/asset-upload-response';
import { z } from 'zod';
import { videoMetadataSchema, MAX_VIDEO_BYTES, type VideoDeriveOptions } from '@/shared/media/video-contracts';
import type { AssetRecord } from '../model/types';
import { AssetClientError, type ActiveAssetScope } from './remote-asset';
import { mapRemoteAudioAsset, remoteAudioAssetSchema } from './remote-audio-asset';

export const remoteVideoAssetSchema = z.object({
  id: z.string().min(1), originalName: z.string(), contentType: z.string(), createdAt: z.string(),
  video: videoMetadataSchema,
}).refine((asset) => asset.contentType === asset.video.contentType, {
  message: 'Video content type must match verified video metadata.', path: ['contentType'],
});

export function mapRemoteVideoAsset(asset: z.infer<typeof remoteVideoAssetSchema>): AssetRecord {
  return { id: asset.id, kind: 'video', name: asset.originalName, mimeType: asset.contentType,
    video: asset.video, width: asset.video.width, height: asset.video.height,
    createdAt: asset.createdAt, storage: { type: 'remote', assetId: asset.id } };
}

export async function uploadRemoteVideoAsset(file: File, scope: ActiveAssetScope, request: typeof fetch = fetch) {
  if (file.size > MAX_VIDEO_BYTES) throw new Error('Video must be 1 GiB or smaller.');
  const body = new FormData();
  body.set('file', file); body.set('workspaceId', scope.workspaceId); body.set('documentId', scope.documentId);
  let response = await request('/api/assets/video', { method: 'POST', credentials: 'same-origin', body });
  response = await awaitAssetUpload(response, request);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new AssetClientError(response.status, payload);
  return mapRemoteVideoAsset(remoteVideoAssetSchema.parse(payload?.asset));
}

export async function deriveRemoteVideoAsset(input: VideoDeriveOptions & {
  workspaceId: string; assetId: string;
}, request: typeof fetch = fetch, signal?: AbortSignal) {
  const response = await request('/api/assets/video/derive', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new AssetClientError(response.status, payload);
  return input.kind === 'audio' ? mapRemoteAudioAsset(remoteAudioAssetSchema.parse(payload?.asset))
    : mapRemoteVideoAsset(remoteVideoAssetSchema.parse(payload?.asset));
}
