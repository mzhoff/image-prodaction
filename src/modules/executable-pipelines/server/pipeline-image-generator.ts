import { createHash } from 'node:crypto';
import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import { getGenerationJob, type GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import type { GenerateLayerInputs, GenerateReferenceSlot } from '@/entities/production-graph/model/generate-prompt-builder';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { QueuedGenerateImagePayload } from '@/modules/generation';
import {
  cancelGenerationJob,
  submitGenerationJob,
} from '@/modules/generation/server/generation-submission-service';
import { getImageModelConfig, PREFERRED_IMAGE_MODEL_IDS } from '@/shared/api/openrouter-models';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { readPipelineImageDataUrl, toPipelineImageArtifact } from './pipeline-image-artifacts';
import type { PipelineImageGenerator, PipelineImageOperationScope } from './pipeline-image-contracts';
import { readString, requireString } from './pipeline-handler-values';

export function createQueuedImageGenerator(
  scope: PipelineImageOperationScope,
): PipelineImageGenerator {
  return async (input) => {
    if (!scope.documentId) throw handlerError('Image generation requires a source document.', input.nodeId);
    const model = requireString(input.config.model, 'Model');
    const aspectRatio = requireString(input.config.aspectRatio, 'Aspect ratio');
    const size = requireString(input.config.size, 'Image size');
    validateImageGenerationConfig(model, aspectRatio, size, input.nodeId);
    const inputs = createEmptyLayerInputs();
    const promptInputs: string[] = [];
    for (const entry of input.textInputs) {
      const text = entry.text.trim();
      if (!text) continue;
      const slot = readLayerSlot(entry.inputKey);
      if (slot) inputs[slot].push(text);
      else promptInputs.push(text);
    }
    const referenceImages = await Promise.all(input.imageInputs.slice(0, 4).map(async (entry) => ({
      dataUrl: await readPipelineImageDataUrl(scope.actorUserId, input.context.workspaceId, entry.artifact),
      sourceAssetId: entry.artifact.assetId,
      slots: [readReferenceSlot(entry.inputKey)],
    })));
    const payload: QueuedGenerateImagePayload = {
      aspectRatio,
      documentId: scope.documentId,
      inputs,
      locationInputs: [],
      model,
      prompt: [readString(input.config.prompt).trim(), ...promptInputs].filter(Boolean).join('\n\n'),
      referenceImages,
      size,
      subjectInputs: [],
      workspaceId: input.context.workspaceId,
    };
    const job = await submitGenerationJob({
      documentId: scope.documentId,
      idempotencyKey: `pipeline:${input.context.runId}:node:${input.nodeId}`,
      maxAttempts: 3,
      metadata: {
        aspectRatio,
        pipelineId: input.context.pipelineId,
        pipelineRunId: input.context.runId,
        pipelineNodeId: input.nodeId,
        requestHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        size,
      },
      modelId: model,
      operation: 'generate_image',
      payload,
      provider: 'openrouter',
      userId: scope.actorUserId,
      workspaceId: input.context.workspaceId,
    });
    const completed = await waitForCompletion(scope.actorUserId, job, input.nodeId, input.signal);
    if (!completed.finalAssetId) throw handlerError('Image generation completed without an asset.', input.nodeId);
    const asset = await getAssetMetadata(scope.actorUserId, completed.finalAssetId);
    if (asset.workspaceId !== input.context.workspaceId || asset.mediaKind !== 'image') {
      throw handlerError('Generated image asset has an invalid scope.', input.nodeId);
    }
    return toPipelineImageArtifact(asset, input.context.runId);
  };
}

async function waitForCompletion(
  actorUserId: string,
  initialJob: GenerationJobDto,
  nodeId: string,
  signal: AbortSignal,
) {
  try {
    return await waitForGenerationJob({ actorUserId, initialJob, nodeId, signal });
  } catch (error) {
    if (isPipelineCancellation(signal)) {
      await cancelGenerationJob(actorUserId, initialJob.id).catch(() => undefined);
    }
    throw error;
  }
}

async function waitForGenerationJob(input: {
  actorUserId: string;
  initialJob: GenerationJobDto;
  nodeId: string;
  signal: AbortSignal;
}) {
  let job = input.initialJob;
  const deadline = Date.now() + 10 * 60_000;
  while (true) {
    if (job.status === 'succeeded') return job;
    if (job.status === 'canceled') throw handlerError('Image generation was canceled.', input.nodeId);
    if (job.status === 'failed' && (!job.error?.retryable || job.attemptCount >= job.maxAttempts)) {
      throw new PipelineNodeHandlerError({
        message: job.error?.message ?? 'Image generation failed.',
        nodeId: input.nodeId,
        retryable: job.error?.retryable ?? false,
      });
    }
    if (Date.now() >= deadline) {
      throw new PipelineNodeHandlerError({
        message: 'Image generation did not finish within 10 minutes.',
        nodeId: input.nodeId,
        retryable: true,
      });
    }
    await waitWithSignal(500, input.signal);
    job = await getGenerationJob(input.actorUserId, job.id);
  }
}

function validateImageGenerationConfig(model: string, aspectRatio: string, size: string, nodeId: string) {
  if (!PREFERRED_IMAGE_MODEL_IDS.includes(model)) {
    throw handlerError(`Model ${model} is not available for image generation.`, nodeId);
  }
  const config = getImageModelConfig(model);
  if (!config.aspectRatios.includes(aspectRatio) || !config.sizes.includes(size)) {
    throw handlerError('Aspect ratio or size is unavailable for the selected image model.', nodeId);
  }
}

function createEmptyLayerInputs(): GenerateLayerInputs {
  return Object.fromEntries(productionLayers.map((layer) => [layer.id, []])) as unknown as GenerateLayerInputs;
}

function readLayerSlot(inputKey: string) {
  const base = inputKey.split('.')[0];
  return productionLayers.find((layer) => layer.id === base)?.id;
}

function readReferenceSlot(inputKey: string): GenerateReferenceSlot {
  return readLayerSlot(inputKey) ?? 'reference';
}

function handlerError(message: string, nodeId: string) {
  return new PipelineNodeHandlerError({ message, nodeId });
}

function isPipelineCancellation(signal: AbortSignal) {
  return signal.aborted && signal.reason instanceof Error && signal.reason.message.includes('lease canceled');
}

function waitWithSignal(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new Error('Pipeline execution was aborted.'));
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new Error('Pipeline execution was aborted.'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
