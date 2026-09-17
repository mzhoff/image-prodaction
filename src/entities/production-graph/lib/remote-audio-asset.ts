import { z } from 'zod';
import { audioMetadataSchema, MAX_AUDIO_BYTES } from '@/shared/media/audio-contracts';
import type { AssetRecord } from '../model/types';
import { AssetClientError, getActiveAssetScope, type ActiveAssetScope, type DurableAssetOrigin } from './remote-asset';

export const remoteAudioAssetSchema = z.object({
  id: z.string().min(1), originalName: z.string(), contentType: z.string(), createdAt: z.string(),
  audio: audioMetadataSchema,
  byteSize: z.number().int().nonnegative().optional(),
});
export function mapRemoteAudioAsset(asset: z.infer<typeof remoteAudioAssetSchema>): AssetRecord {
  return { id: asset.id, kind: 'audio', name: asset.originalName, mimeType: asset.contentType,
    createdAt: asset.createdAt, audio: asset.audio, storage: { type: 'remote', assetId: asset.id } };
}

export async function uploadRemoteAudioAsset(file: File, scope: ActiveAssetScope, request: typeof fetch = fetch, origin: DurableAssetOrigin = 'uploaded'): Promise<AssetRecord> {
  if (file.size > MAX_AUDIO_BYTES) throw new Error('Audio must be 50 MiB or smaller.');
  const body = new FormData();
  body.set('file', file); body.set('workspaceId', scope.workspaceId); body.set('documentId', scope.documentId);
  body.set('origin', origin);
  const response = await request('/api/assets/audio', { method: 'POST', credentials: 'same-origin', body });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new AssetClientError(response.status, payload);
  const parsed = remoteAudioAssetSchema.safeParse(payload?.asset);
  if (!parsed.success) throw new Error('The server returned an invalid audio asset.');
  return mapRemoteAudioAsset(parsed.data);
}

export async function saveUploadedAudioAsset(file: File, scope = getActiveAssetScope(), origin: DurableAssetOrigin = 'uploaded') {
  if (!scope) throw new Error('Open a saved project before uploading audio.');
  return uploadRemoteAudioAsset(file, scope, fetch, origin);
}
