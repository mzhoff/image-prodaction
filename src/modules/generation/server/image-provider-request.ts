import {
  composeGenerationPrompt,
  composeReferenceImageInstruction,
} from '@/entities/production-graph/model/generate-prompt-builder';
import type { ProviderImageOutput, ProviderMessagePart } from '@/modules/provider-connections';
import type { QueuedGenerateImagePayload } from './image-generation-contracts';
import { GenerationExecutionError } from './generation-worker';

export function createProviderRequest(payload: QueuedGenerateImagePayload) {
  const prompt = composeGenerationPrompt({
    aspectRatio: payload.aspectRatio,
    inputs: payload.inputs,
    locationInputs: payload.locationInputs,
    prompt: payload.prompt,
    referenceImages: payload.referenceImages,
    size: payload.size,
    subjectInputs: payload.subjectInputs,
  });
  const parts: ProviderMessagePart[] = [
    { modality: 'text', text: prompt },
    ...payload.referenceImages.flatMap<ProviderMessagePart>((reference, index) => [
      { modality: 'text', text: composeReferenceImageInstruction(reference, index + 1) },
      { modality: 'image', data: reference.dataUrl },
    ]),
  ];
  return {
    expectedOutputModalities: ['image'] as Array<'image'>,
    messages: [{ role: 'user' as const, parts }],
    modelId: payload.model,
    operation: 'generate_image',
    parameters: { image: { aspectRatio: payload.aspectRatio, size: payload.size } },
  };
}

export function assertPayloadScope(
  payload: QueuedGenerateImagePayload,
  workspaceId: string,
  documentId: string | null,
) {
  if (payload.workspaceId !== workspaceId || payload.documentId !== documentId) {
    throw executionError(
      'generation_payload_scope_mismatch',
      'Generation payload does not belong to this job scope.',
      false,
    );
  }
}

export function toImageUrl(output: ProviderImageOutput) {
  if (output.url) return output.url;
  if (!output.data || !output.mediaType) {
    throw executionError('invalid_image_result', 'Provider returned an invalid image payload.', false);
  }
  return `data:${output.mediaType};base64,${output.data}`;
}

export function decodeImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s);
  if (!match) {
    throw executionError('invalid_image_result', 'Provider returned an unsupported image format.', false);
  }
  return { contentType: match[1], bytes: new Uint8Array(Buffer.from(match[2], 'base64')) };
}

export function getImageExtension(contentType: string) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  return 'png';
}

function executionError(code: string, message: string, retryable: boolean) {
  return new GenerationExecutionError({ code, message, retryable });
}
