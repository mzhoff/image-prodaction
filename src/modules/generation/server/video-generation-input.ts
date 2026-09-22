import sharp from 'sharp';
import { getAssetContent, getAssetMetadata } from '@/entities/asset/server/asset-service';
import { readBoundedAudioStream } from '@/shared/media/audio-upload-request';
import type { VideoGenerationRequest } from '@/shared/media/video-generation-contracts';
import type { VideoProviderInput } from '@/modules/provider-connections/contracts/video-provider';

export interface QueuedVideoPayload { workspaceId: string; documentId: string | null; homeConversationId?: string; request: VideoGenerationRequest }
export async function validateVideoAssets(request: VideoGenerationRequest, userId: string, workspaceId: string) {
  const images = [request.firstFrame, request.lastFrame, ...request.references].filter((image) => image !== undefined);
  for (const image of images) {
    const asset = await getAssetMetadata(userId, image.assetId);
    if (asset.workspaceId !== workspaceId || asset.mediaKind !== 'image' || asset.status !== 'ready'
      || asset.byteSize > 32 * 1024 * 1024) throw new Error('Подключите готовое изображение из текущего пространства, не больше 32 MiB.');
  }
}
export async function prepareVideoInputs(payload: QueuedVideoPayload, userId: string, signal: AbortSignal): Promise<VideoProviderInput> {
  await validateVideoAssets(payload.request, userId, payload.workspaceId);
  const url = async (assetId: string) => {
    const content = await getAssetContent(userId, assetId);
    if (content.asset.workspaceId !== payload.workspaceId || content.asset.mediaKind !== 'image') throw new Error('Video image scope mismatch.');
    const bytes = await readBoundedAudioStream(content.object.body, 32 * 1024 * 1024, signal);
    const image = await sharp(bytes, { limitInputPixels: 80_000_000 }).rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
    signal.throwIfAborted();
    return `data:image/jpeg;base64,${image.toString('base64')}`;
  };
  const { firstFrame, lastFrame, references, ...settings } = payload.request;
  // Bounded, sequential image preparation avoids simultaneous large decoders.
  const result: VideoProviderInput = { ...settings, references: [] };
  if (firstFrame) result.firstFrame = await url(firstFrame.assetId);
  if (lastFrame) result.lastFrame = await url(lastFrame.assetId);
  for (const ref of references) result.references.push({ slot: ref.slot, description: ref.description, url: await url(ref.assetId) });
  return result;
}
