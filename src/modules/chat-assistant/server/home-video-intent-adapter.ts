import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import { buildHomeVideoIntentRequest, HomeVideoIntentError, orderedHomeVideoSlots } from '@/shared/media/home-video-intent';
import type { VideoGenerationRequest } from '@/shared/media/video-generation-contracts';
import { HomeVideoGenerationError, type HomeVideoGenerationInput } from '../contracts/home-video-generation';
import { applyHomeVideoAttachmentAssets, homeVideoAttachmentAssetId, validateHomeVideoAttachments } from './home-video-attachments';

/** Freeze the semantic slot mapping before touching uploaded bytes or the paid queue. */
export function planHomeVideoInput(principal: ChatPrincipal, input: HomeVideoGenerationInput) {
  const { request, intent } = input;
  if (!intent) {
    validateHomeVideoAttachments(request, input.attachmentIds);
    return {
      attachmentIds: input.attachmentIds, materializationRequest: request,
      candidate: applyHomeVideoAttachmentAssets(request, input.attachmentIds.map((id) => ({ assetId: homeVideoAttachmentAssetId(principal, id), description: '' }))),
      finalize: (materialized: VideoGenerationRequest) => materialized,
    };
  }
  if (input.attachmentIds.length || request.firstFrame || request.lastFrame || request.references.length) {
    throw new HomeVideoGenerationError('Используйте слоты кадров и референсов без дополнительного списка вложений.');
  }
  try {
    const candidate = buildHomeVideoIntentRequest(request, intent, (id) => homeVideoAttachmentAssetId(principal, id));
    const attachmentIds = orderedHomeVideoSlots(intent.slots).map((slot) => slot.attachmentId);
    // The existing materializer persists each owned attachment. Typed slot positions
    // and descriptions are applied afterwards instead of being lost in its flat list.
    const materializationRequest = { ...request, mode: candidate.mode };
    return { candidate, attachmentIds, materializationRequest,
      finalize(materialized: VideoGenerationRequest) {
        const images = [materialized.firstFrame, materialized.lastFrame, ...materialized.references].filter((image) => image !== undefined);
        if (images.length !== attachmentIds.length) throw new HomeVideoGenerationError('Не удалось подготовить все изображения. Прикрепите их ещё раз.');
        const actualAssets = new Map(attachmentIds.map((id, index) => [id, images[index].assetId]));
        return buildHomeVideoIntentRequest(request, intent, (id) => {
          const assetId = actualAssets.get(id);
          if (!assetId) throw new HomeVideoGenerationError('Изображение из выбранного слота недоступно.');
          return assetId;
        });
      },
    };
  } catch (error) {
    if (error instanceof HomeVideoIntentError) throw new HomeVideoGenerationError(error.message);
    throw error;
  }
}
