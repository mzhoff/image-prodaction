import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  getAssetContent,
  getAssetMetadata,
  type AssetDto,
} from '@/entities/asset/server/asset-service';
import {
  getGenerationJob,
  type GenerationJobDto,
} from '@/entities/generation/server/generation-orchestrator';
import type {
  GenerateLayerInputs,
  GenerateReferenceSlot,
} from '@/entities/production-graph/model/generate-prompt-builder';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import {
  executeInternalOpenRouterChat,
  type QueuedGenerateImagePayload,
} from '@/modules/generation';
import {
  cancelGenerationJob,
  submitGenerationJob,
} from '@/modules/generation/server/generation-submission-service';
import type { ProviderResult } from '@/modules/provider-connections';
import {
  getImageModelConfig,
  PREFERRED_IMAGE_MODEL_IDS,
} from '@/shared/api/openrouter-models';
import type {
  PipelineArtifactReference,
  PipelineExecutionContext,
  PipelineValue,
} from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';

export interface PipelineImageOperationScope {
  actorUserId: string;
  documentId?: string;
}

export type PipelineImageAnalyzer = (input: {
  artifact: PipelineArtifactReference;
  config: Record<string, PipelineValue>;
  context: PipelineExecutionContext;
  nodeId: string;
  signal: AbortSignal;
}) => Promise<string>;

export type PipelineImageGenerator = (input: {
  config: Record<string, PipelineValue>;
  context: PipelineExecutionContext;
  imageInputs: Array<{ artifact: PipelineArtifactReference; inputKey: string }>;
  nodeId: string;
  signal: AbortSignal;
  textInputs: Array<{ inputKey: string; text: string }>;
}) => Promise<PipelineArtifactReference>;

export function createOpenRouterImageAnalyzer(
  scope: PipelineImageOperationScope,
): PipelineImageAnalyzer {
  return async (input) => {
    const imageDataUrl = await readPipelineImageDataUrl(
      scope.actorUserId,
      input.context.workspaceId,
      input.artifact,
    );
    const prompt = requireString(input.config.prompt, 'Analysis prompt');
    const execution = await executeInternalOpenRouterChat({
      actorUserId: scope.actorUserId,
      documentId: scope.documentId,
      idempotencyKey: `pipeline:${input.context.runId}:node:${input.nodeId}`,
      metadata: {
        pipelineId: input.context.pipelineId,
        pipelineRunId: input.context.runId,
        pipelineNodeId: input.nodeId,
      },
      providerRequest: {
        modelId: requireString(input.config.model, 'Model'),
        operation: 'analyze_image',
        expectedOutputModalities: ['text'],
        messages: [
          {
            role: 'system',
            parts: [{
              modality: 'text',
              text: 'You are a senior art director, commercial image analyst, and prompt engineer for AI image production. Follow the user instruction exactly. Return detailed, structured, production-ready notes that can be reused directly as an image generation prompt. Preserve visible text exactly, especially Cyrillic. Do not invent brand names or logos.',
            }],
          },
          {
            role: 'user',
            parts: [
              { modality: 'text', text: prompt },
              { modality: 'image', url: imageDataUrl },
            ],
          },
        ],
        parameters: { maxOutputTokens: 3500, temperature: 0.2 },
      },
      signal: input.signal,
      transform: getProviderText,
      workspaceId: input.context.workspaceId,
    });
    return execution.result;
  };
}

export function createQueuedImageGenerator(
  scope: PipelineImageOperationScope,
): PipelineImageGenerator {
  return async (input) => {
    if (!scope.documentId) {
      throw handlerError('Image generation requires a source document.', input.nodeId);
    }
    const model = requireString(input.config.model, 'Model');
    const aspectRatio = requireString(input.config.aspectRatio, 'Aspect ratio');
    const size = requireString(input.config.size, 'Image size');
    validateImageGenerationConfig(model, aspectRatio, size, input.nodeId);
    const layerInputs = createEmptyLayerInputs();
    const promptInputs: string[] = [];
    for (const entry of input.textInputs) {
      const text = entry.text.trim();
      if (!text) continue;
      const slot = readLayerSlot(entry.inputKey);
      if (slot) layerInputs[slot].push(text);
      else promptInputs.push(text);
    }
    const prompt = [readString(input.config.prompt).trim(), ...promptInputs]
      .filter(Boolean)
      .join('\n\n');
    const referenceImages = await Promise.all(input.imageInputs.slice(0, 4).map(async (entry) => ({
      dataUrl: await readPipelineImageDataUrl(
        scope.actorUserId,
        input.context.workspaceId,
        entry.artifact,
      ),
      sourceAssetId: entry.artifact.assetId,
      slots: [readReferenceSlot(entry.inputKey)],
    })));
    const payload: QueuedGenerateImagePayload = {
      aspectRatio,
      documentId: scope.documentId,
      inputs: layerInputs,
      locationInputs: [],
      model,
      prompt,
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
    let completed: GenerationJobDto;
    try {
      completed = await waitForGenerationJob({
        actorUserId: scope.actorUserId,
        initialJob: job,
        nodeId: input.nodeId,
        signal: input.signal,
      });
    } catch (error) {
      if (isPipelineCancellation(input.signal)) {
        await cancelGenerationJob(scope.actorUserId, job.id).catch(() => undefined);
      }
      throw error;
    }
    if (!completed.finalAssetId) {
      throw handlerError('Image generation completed without an asset.', input.nodeId);
    }
    const asset = await getAssetMetadata(scope.actorUserId, completed.finalAssetId);
    if (asset.workspaceId !== input.context.workspaceId || asset.mediaKind !== 'image') {
      throw handlerError('Generated image asset has an invalid scope.', input.nodeId);
    }
    return toPipelineImageArtifact(asset, input.context.runId);
  };
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
    if (job.status === 'canceled') {
      throw handlerError('Image generation was canceled.', input.nodeId);
    }
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

async function readPipelineImageDataUrl(
  actorUserId: string,
  workspaceId: string,
  artifact: PipelineArtifactReference,
) {
  const content = await getAssetContent(actorUserId, artifact.assetId);
  if (content.asset.workspaceId !== workspaceId || content.asset.mediaKind !== 'image') {
    throw new Error('Image artifact does not belong to the pipeline workspace.');
  }
  const bytes = new Uint8Array(await new Response(content.object.body).arrayBuffer());
  return prepareServerImageDataUrl(bytes, content.contentType);
}

async function prepareServerImageDataUrl(bytes: Uint8Array, contentType: string) {
  const maxBytes = 4_500_000;
  if (
    bytes.byteLength <= maxBytes
    && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(contentType)
  ) {
    return toDataUrl(bytes, contentType);
  }
  for (const quality of [86, 78, 68, 58]) {
    const converted = await sharp(bytes)
      .rotate()
      .resize({ fit: 'inside', height: 1536, width: 1536, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (converted.byteLength <= maxBytes) return toDataUrl(converted, 'image/jpeg');
  }
  throw new Error('Image artifact is too large for the AI provider.');
}

function toPipelineImageArtifact(asset: AssetDto, runId: string): PipelineArtifactReference {
  return {
    assetId: asset.id,
    checksumSha256: asset.checksumSha256,
    contentUrl: `/v1/runs/${runId}/artifacts/${asset.id}`,
    height: asset.height,
    kind: 'image',
    mimeType: asset.contentType,
    sizeBytes: asset.byteSize,
    width: asset.width,
  };
}

function validateImageGenerationConfig(
  model: string,
  aspectRatio: string,
  size: string,
  nodeId: string,
) {
  if (!PREFERRED_IMAGE_MODEL_IDS.includes(model)) {
    throw handlerError(`Model ${model} is not available for image generation.`, nodeId);
  }
  const config = getImageModelConfig(model);
  if (!config.aspectRatios.includes(aspectRatio) || !config.sizes.includes(size)) {
    throw handlerError('Aspect ratio or size is unavailable for the selected image model.', nodeId);
  }
}

function createEmptyLayerInputs(): GenerateLayerInputs {
  return Object.fromEntries(
    productionLayers.map((layer) => [layer.id, []]),
  ) as unknown as GenerateLayerInputs;
}

function readLayerSlot(inputKey: string) {
  const base = inputKey.split('.')[0];
  return productionLayers.find((layer) => layer.id === base)?.id;
}

function readReferenceSlot(inputKey: string): GenerateReferenceSlot {
  return readLayerSlot(inputKey) ?? 'reference';
}

function getProviderText(result: ProviderResult) {
  const output = result.outputs.find((candidate) => candidate.modality === 'text');
  if (!output || output.modality !== 'text' || !output.text.trim()) {
    throw new Error('Provider response does not contain text.');
  }
  return output.text.trim();
}

function readString(value: PipelineValue | undefined) {
  return typeof value === 'string' ? value : '';
}

function requireString(value: PipelineValue | undefined, label: string) {
  const normalized = readString(value).trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function toDataUrl(bytes: Uint8Array, contentType: string) {
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function handlerError(message: string, nodeId: string) {
  return new PipelineNodeHandlerError({ message, nodeId });
}

function isPipelineCancellation(signal: AbortSignal) {
  return signal.aborted
    && signal.reason instanceof Error
    && signal.reason.message.includes('lease canceled');
}

function waitWithSignal(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('Pipeline execution was aborted.'));
      return;
    }
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
