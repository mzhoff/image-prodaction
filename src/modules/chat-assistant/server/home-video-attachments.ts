import { createHash } from 'node:crypto';
import type { ChatAttachmentApplicationService } from '@prodactionpro/chat-application';
import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import { uploadImageAsset } from '@/entities/asset/server/asset-service';
import { readBoundedAudioStream } from '@/shared/media/audio-upload-request';
import type { VideoGenerationRequest } from '@/shared/media/video-generation-contracts';
import { HomeVideoGenerationError } from '../contracts/home-video-generation';

export function validateHomeVideoAttachments(request: VideoGenerationRequest, ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new HomeVideoGenerationError('Каждый референс можно прикрепить только один раз.');
  if (!ids.length) return;
  if (request.firstFrame || request.lastFrame || request.references.length) throw new HomeVideoGenerationError('Выберите один способ прикрепления изображений.');
  if (request.mode === 'text') throw new HomeVideoGenerationError('Выберите режим кадров или референсов, чтобы использовать изображения.');
  if (request.mode === 'frames' && ids.length > 2) throw new HomeVideoGenerationError('Для режима кадров нужны только первый и последний кадр.');
}

/** Stable hidden asset IDs preserve a managed attachment across enqueue retries. */
export async function materializeHomeVideoAttachments(principal: ChatPrincipal, ids: string[],
  request: VideoGenerationRequest, service: ChatAttachmentApplicationService,
  upload: typeof uploadImageAsset = uploadImageAsset, fetchContent: typeof fetch = fetch) {
  validateHomeVideoAttachments(request, ids);
  const images: Array<{ assetId: string; description: string }> = [];
  for (const id of ids) {
    const { attachment, ref } = await service.getAttachment(id, principal);
    if (attachment.status !== 'ready' || attachment.kind !== 'image' || !ref) {
      throw new HomeVideoGenerationError('Дождитесь загрузки изображений или прикрепите их ещё раз.');
    }
    await service.assertReadyReferences([ref], principal);
    const content = await service.getContent(id, principal);
    const signal = AbortSignal.timeout(20_000);
    const response = await fetchContent(content.url, { headers: content.headers, method: content.method, signal });
    if (!response.ok || !response.body) throw new HomeVideoGenerationError('Не удалось прочитать референс. Прикрепите его ещё раз.');
    const bytes = await readBoundedAudioStream(response.body, 8 * 1024 * 1024, signal);
    const asset = await upload({ bytes, claimedContentType: attachment.mimeType,
      maxBytes: 8 * 1024 * 1024, documentId: null, workspaceId: principal.tenantId!, userId: principal.userId,
      requestedAssetId: homeVideoAttachmentAssetId(principal, id), originalName: attachment.name,
      libraryVisible: false, origin: 'unknown', operation: 'home_video_reference',
      metadata: { source: 'home-video-reference', chatAttachmentId: id },
    });
    images.push({ assetId: asset.id, description: '' });
  }
  return applyHomeVideoAttachmentAssets(request, images);
}

export function applyHomeVideoAttachmentAssets(request: VideoGenerationRequest, images: Array<{ assetId: string; description: string }>) {
  if (!images.length) return request;
  return request.mode === 'frames'
    ? { ...request, firstFrame: images[0], ...(images[1] ? { lastFrame: images[1] } : {}) }
    : { ...request, references: images.map((image, index) => ({ ...image, slot: index + 1 })) };
}

export function homeVideoAttachmentAssetId(principal: ChatPrincipal, attachmentId: string) {
  const hash = createHash('sha256').update(JSON.stringify(['home-video-reference', principal.productId, principal.tenantId, principal.userId, attachmentId])).digest();
  hash[6] = (hash[6] & 15) | 0x50; hash[8] = (hash[8] & 63) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
