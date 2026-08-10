import { normalizeOpenRouterImageUrl } from '@/modules/provider-connections/adapters/openrouter-image-result';
import {
  getMaxImageUploadBytes,
  uploadImageAsset,
} from '@/entities/asset/server/asset-service';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import type { ProviderImageOutput, ProviderResult } from '@/modules/provider-connections';
import type { getGenerationExecutionRecord } from './generation-execution-repository';
import {
  decodeImageDataUrl,
  getImageExtension,
  toImageUrl,
} from './image-provider-request';
import type { QueuedGenerateImagePayload } from './image-generation-contracts';
import { toGenerationUsage } from './generation-usage-recorder';
import { GenerationExecutionError } from './generation-worker';

export async function persistGeneratedImage(input: {
  job: GenerationJobDto;
  jobRecord: Awaited<ReturnType<typeof getGenerationExecutionRecord>>;
  payload: QueuedGenerateImagePayload;
  providerCalled: boolean;
  result: ProviderResult;
}) {
  const imageOutput = input.result.outputs.find(
    (output): output is ProviderImageOutput => output.modality === 'image',
  );
  if (!imageOutput) {
    throw new GenerationExecutionError({
      code: 'missing_modality',
      message: 'Provider completed without an image result.',
      retryable: false,
      usage: input.providerCalled ? toGenerationUsage(input.result) : undefined,
    });
  }
  const imageDataUrl = await normalizeOpenRouterImageUrl(toImageUrl(imageOutput), {
    maxBytes: getMaxImageUploadBytes(),
  });
  const image = decodeImageDataUrl(imageDataUrl);
  return uploadImageAsset({
    bytes: image.bytes,
    claimedContentType: image.contentType,
    documentId: input.payload.documentId,
    generationJobId: input.job.id,
    libraryVisible: false,
    maxBytes: getMaxImageUploadBytes(),
    metadata: {
      aspectRatio: input.payload.aspectRatio,
      generationId: input.result.providerOperationId,
      responseModel: input.result.modelId,
      size: input.payload.size,
    },
    modelId: input.payload.model,
    operation: 'generate_image',
    origin: 'generated',
    originalName: `generated-${input.job.id}.${getImageExtension(image.contentType)}`,
    provider: 'openrouter',
    userId: input.jobRecord.createdByUserId,
    workspaceId: input.payload.workspaceId,
  });
}
