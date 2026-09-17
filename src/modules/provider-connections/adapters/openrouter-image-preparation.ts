import { optimizeReferenceImage } from '@/shared/media/reference-image-optimizer';
import type { ProviderExecuteRequest, ProviderMessagePart } from '../contracts/provider-contracts';
import { ProviderCanceledError } from '../core/provider-errors';
import { toOpenRouterMessagePart } from './openrouter-message-mapping';

export async function prepareOpenRouterImages(request: ProviderExecuteRequest, signal?: AbortSignal): Promise<ProviderExecuteRequest> {
  // WebP support is known for Gemini. Keep unrelated provider/model contracts intact.
  if (request.operation !== 'generate_image' || !request.modelId.startsWith('google/gemini-')) return request;
  const messages: ProviderExecuteRequest['messages'] = [];
  for (const message of request.messages) {
    const parts: ProviderMessagePart[] = [];
    for (const part of message.parts) {
      if (signal?.aborted) throw new ProviderCanceledError(false);
      if (part.modality !== 'image') { parts.push(part); continue; }
      const mapped = toOpenRouterMessagePart(part);
      const url = mapped.image_url?.url;
      if (!url) { parts.push(part); continue; }
      const optimized = await optimizeReferenceImage(url);
      parts.push(optimized === url ? part : { ...part, data: undefined, mediaType: 'image/webp', url: optimized });
    }
    messages.push({ ...message, parts });
  }
  if (signal?.aborted) throw new ProviderCanceledError(false);
  return { ...request, messages };
}
