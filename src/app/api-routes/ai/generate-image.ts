import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  getAssetMetadata,
  getMaxImageUploadBytes,
  publishGeneratedAssetToLibrary,
  uploadImageAsset,
} from '@/entities/asset/server/asset-service';
import {
  createGenerationJob,
  failGenerationJob,
  GenerationIdempotencyConflictError,
  GenerationJobTransitionError,
  recoverExpiredGenerationJob,
  startGenerationJob,
  succeedGenerationJob,
  type GenerationJobDto,
} from '@/entities/generation/server/generation-orchestrator';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import type { OpenRouterMessageContentImage, OpenRouterMessageContentText } from '@/shared/api/openrouter';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';
import {
  DEFAULT_IMAGE_MODEL,
  getImageModelConfig,
  PREFERRED_IMAGE_MODEL_IDS,
} from '@/shared/api/openrouter-models';
import type { GenerateReferenceSlot } from '@/entities/production-graph/model/generate-prompt-builder';
import { composeGenerationPrompt, composeReferenceImageInstruction } from '@/entities/production-graph/model/generate-prompt-builder';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import {
  extractOpenRouterImageUrl,
  extractOpenRouterMessageText,
  missingOpenRouterImageErrorWithContext,
  normalizeOpenRouterImageUrl,
  summarizeOpenRouterImageMessage,
} from './openrouter-image-result';

export const runtime = 'nodejs';

const MAX_GENERATION_REQUEST_BYTES = 30 * 1024 * 1024;
const MAX_REFERENCE_DATA_URL_LENGTH = 6_500_000;
const MAX_PROMPT_TEXT_LENGTH = 50_000;
const generationTextSchema = z.string().min(1).max(20_000);

const structuredInputsSchema = z.object({
  actors: z.array(generationTextSchema).max(50).default([]),
  actions: z.array(generationTextSchema).max(50).default([]),
  composition: z.array(generationTextSchema).max(50).default([]),
  camera: z.array(generationTextSchema).max(50).default([]),
  background: z.array(generationTextSchema).max(50).default([]),
  style: z.array(generationTextSchema).max(50).default([]),
  light: z.array(generationTextSchema).max(50).default([]),
  color: z.array(generationTextSchema).max(50).default([]),
  metaphor: z.array(generationTextSchema).max(50).default([]),
  text: z.array(generationTextSchema).max(50).default([]),
});

const emptyStructuredInputs = {
  actors: [],
  actions: [],
  composition: [],
  camera: [],
  background: [],
  style: [],
  light: [],
  color: [],
  metaphor: [],
  text: [],
};

const generateImageSchema = z.object({
  documentId: z.string().refine(isUuidV7),
  idempotencyKey: z.string().trim().min(1).max(255),
  model: z.string().min(1).default(DEFAULT_IMAGE_MODEL),
  prompt: z.string().max(MAX_PROMPT_TEXT_LENGTH).default(''),
  aspectRatio: z.string().min(1).default('1:1'),
  size: z.string().min(1).default('1K'),
  inputs: structuredInputsSchema.default(emptyStructuredInputs),
  subjectInputs: z.array(generationTextSchema).max(50).default([]),
  locationInputs: z.array(generationTextSchema).max(50).default([]),
  referenceImages: z.array(z.object({
    dataUrl: z.string().min(1).max(MAX_REFERENCE_DATA_URL_LENGTH),
    sourceAssetId: z.string().optional(),
    sourceNodeTypes: z.array(z.custom<ProductionNodeType>(isProductionNodeType)).max(50).optional(),
    slots: z.array(z.custom<GenerateReferenceSlot>(isGenerateReferenceSlot)).max(50).default([]),
  })).max(4).default([]),
  workspaceId: z.string().refine(isUuidV7),
});

const referenceSlotIds = new Set<string>(['reference', ...productionLayers.map((layer) => layer.id)]);
const productionNodeTypes = new Set<string>([
  'importImage',
  'textPrompt',
  'textConcat',
  'textGeneration',
  'textSplitter',
  'subjectBuilder',
  'locationBuilder',
  'imageToText',
  'referenceComposer',
  'generateImage',
  'sketch',
  'cropImage',
  'adjustment',
  'curves',
  'frequencyRetouch',
  'refineImage',
  'removeBackground',
  'exportImage',
  'preview',
]);

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_GENERATION_REQUEST_BYTES) {
    return apiError('generation_request_too_large', 'Generation request is too large.', 413);
  }
  const parsed = generateImageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const hasPrompt = parsed.data.prompt.trim().length > 0;
  const hasStructuredText = Object.values(parsed.data.inputs).some((items) => items.length > 0);
  const hasSubjects = parsed.data.subjectInputs.some((item) => item.trim().length > 0);
  const hasLocations = parsed.data.locationInputs.some((item) => item.trim().length > 0);
  const hasImages = parsed.data.referenceImages.length > 0;
  if (!hasPrompt && !hasStructuredText && !hasSubjects && !hasLocations && !hasImages) {
    return Response.json({ error: 'Add a prompt or connect at least one reference.' }, { status: 400 });
  }

  const imageConfig = getImageModelConfig(parsed.data.model);
  if (!imageConfig.aspectRatios.includes(parsed.data.aspectRatio) || !imageConfig.sizes.includes(parsed.data.size)) {
    return Response.json({ error: 'Aspect ratio or size is not available for selected model.' }, { status: 400 });
  }

  let startedJob: GenerationJobDto | null = null;
  let providerUsage: ReturnType<typeof normalizeProviderUsage> | undefined;
  try {
    const session = await requireApiSession(request);
    if (!process.env.OPENROUTER_API_KEY) {
      return apiError(
        'openrouter_not_configured',
        'OPENROUTER_API_KEY is not configured.',
        503,
      );
    }
    if (!PREFERRED_IMAGE_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for image generation.` }, { status: 400 });
    }

    const job = await createGenerationJob({
      userId: session.user.id,
      workspaceId: parsed.data.workspaceId,
      documentId: parsed.data.documentId,
      provider: 'openrouter',
      modelId: parsed.data.model,
      operation: 'generate_image',
      idempotencyKey: parsed.data.idempotencyKey,
      metadata: {
        aspectRatio: parsed.data.aspectRatio,
        referenceCount: parsed.data.referenceImages.length,
        requestHash: createHash('sha256')
          .update(JSON.stringify(parsed.data))
          .digest('hex'),
        size: parsed.data.size,
      },
    });
    const replayResponse = await resolveIdempotentReplay(job, session.user.id);
    if (replayResponse) return replayResponse;
    startedJob = await startGenerationJob(job.id);

    const referenceImages = parsed.data.referenceImages;
    const prompt = composeGenerationPrompt({
      aspectRatio: parsed.data.aspectRatio,
      inputs: parsed.data.inputs,
      locationInputs: parsed.data.locationInputs,
      prompt: parsed.data.prompt,
      referenceImages,
      size: parsed.data.size,
      subjectInputs: parsed.data.subjectInputs,
    });
    const content: Array<OpenRouterMessageContentText | OpenRouterMessageContentImage> = [
      { type: 'text', text: prompt },
      ...referenceImages.flatMap((reference, index) => [
        { type: 'text' as const, text: composeReferenceImageInstruction(reference, index + 1) },
        { type: 'image_url' as const, image_url: { url: reference.dataUrl } },
      ]),
    ];

    console.info('[openrouter:image:generate] request', {
      aspectRatio: parsed.data.aspectRatio,
      model: parsed.data.model,
      locationCount: parsed.data.locationInputs.length,
      referenceCount: referenceImages.length,
      size: parsed.data.size,
      subjectCount: parsed.data.subjectInputs.length,
    });
    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      modalities: ['image', 'text'],
      imageConfig: {
        aspect_ratio: parsed.data.aspectRatio,
        image_size: parsed.data.size,
      },
    });
    providerUsage = normalizeProviderUsage(result.usage);

    const message = result.choices?.[0]?.message;
    const responseSummary = summarizeOpenRouterImageMessage(message);
    console.info('[openrouter:image:generate] response', {
      ...responseSummary,
      model: parsed.data.model,
    });
    const imageUrl = extractOpenRouterImageUrl(message);
    if (!imageUrl) {
      console.warn('[openrouter:image:generate] missing image payload', {
        ...responseSummary,
        model: parsed.data.model,
      });
      throw new Error(missingOpenRouterImageErrorWithContext('OpenRouter generation', message));
    }

    const normalizedImage = await normalizeOpenRouterImageUrl(imageUrl, {
      maxBytes: getMaxImageUploadBytes(),
    });
    const image = decodeImageDataUrl(normalizedImage);
    const asset = await uploadImageAsset({
      bytes: image.bytes,
      claimedContentType: image.contentType,
      documentId: parsed.data.documentId,
      generationJobId: startedJob.id,
      libraryVisible: false,
      maxBytes: getMaxImageUploadBytes(),
      metadata: {
        aspectRatio: parsed.data.aspectRatio,
        generationId: result.id ?? null,
        responseModel: result.model ?? null,
        responseProvider: result.provider ?? null,
        size: parsed.data.size,
      },
      modelId: parsed.data.model,
      operation: 'generate_image',
      origin: 'generated',
      originalName: `generated-${startedJob.id}.${getImageExtension(image.contentType)}`,
      provider: 'openrouter',
      userId: session.user.id,
      workspaceId: parsed.data.workspaceId,
    });
    const completedJob = await succeedGenerationJob({
      assetId: asset.id,
      attemptCount: startedJob.attemptCount,
      jobId: startedJob.id,
      usage: providerUsage,
    });
    const publishedAsset = await publishGeneratedAssetToLibrary(session.user.id, asset.id);

    return Response.json({
      asset: publishedAsset,
      job: completedJob,
      message: extractOpenRouterMessageText(message),
      provider: 'openrouter',
      usage: completedJob.usage,
    });
  } catch (error) {
    if (startedJob) {
      await failGenerationJob({
        attemptCount: startedJob.attemptCount,
        errorCode: getGenerationErrorCode(error),
        errorMessage: formatOpenRouterError(error, 'Image generation failed'),
        jobId: startedJob.id,
        retryable: isRetryableGenerationError(error),
        usage: providerUsage,
      }).catch((ledgerError: unknown) => {
        console.error('[generation:ledger] failed to record generation failure', ledgerError);
      });
    }
    if (error instanceof GenerationIdempotencyConflictError) {
      return apiError('generation_idempotency_conflict', error.message, 409);
    }
    if (error instanceof GenerationJobTransitionError) {
      return apiError('generation_job_conflict', error.message, 409);
    }
    const baseResponse = toApiErrorResponse(error);
    if (baseResponse.status !== 500) return baseResponse;
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter generation failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}

function isGenerateReferenceSlot(value: unknown) {
  return typeof value === 'string' && referenceSlotIds.has(value);
}

function isProductionNodeType(value: unknown) {
  return typeof value === 'string' && productionNodeTypes.has(value);
}

async function resolveIdempotentReplay(job: GenerationJobDto, userId: string) {
  if (!job.idempotentReplay) return null;
  if (job.status === 'succeeded' && job.finalAssetId) {
    const asset = await getAssetMetadata(userId, job.finalAssetId);
    const publishedAsset = asset.libraryVisible
      ? asset
      : await publishGeneratedAssetToLibrary(userId, job.finalAssetId);
    return Response.json({
      asset: publishedAsset,
      job,
      message: 'Generation result restored from the existing request.',
      provider: job.provider,
      usage: job.usage,
    });
  }
  if (job.status === 'running') {
    const leaseExpiresAt = job.leaseExpiresAt ? new Date(job.leaseExpiresAt) : null;
    if (!leaseExpiresAt || leaseExpiresAt.getTime() <= Date.now()) {
      await recoverExpiredGenerationJob(job.id);
      return null;
    }
    return apiError('generation_in_progress', 'This generation request is already running.', 409, {
      details: { jobId: job.id },
    });
  }
  if (job.status === 'failed' && !job.error?.retryable) {
    return apiError('generation_failed', job.error?.message ?? 'Generation request failed.', 409, {
      details: { jobId: job.id },
    });
  }
  return null;
}

function normalizeProviderUsage(usage: {
  completion_tokens?: number;
  cost?: number;
  prompt_tokens?: number;
  total_tokens?: number;
} | undefined) {
  const inputTokens = normalizeTokenCount(usage?.prompt_tokens);
  const outputTokens = normalizeTokenCount(usage?.completion_tokens);
  const totalTokens = normalizeTokenCount(usage?.total_tokens);
  if (inputTokens === null || outputTokens === null || totalTokens === null) {
    console.warn('[generation:usage] provider response is missing complete token usage');
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    providerCostUsd: normalizeProviderCost(usage?.cost),
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
  };
}

function normalizeTokenCount(value: number | undefined) {
  return Number.isSafeInteger(value) && (value ?? -1) >= 0
    ? value as number
    : null;
}

function normalizeProviderCost(value: number | undefined) {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) {
    console.warn('[generation:usage] provider response contains an invalid cost');
    return null;
  }
  return value.toFixed(8).replace(/\.?0+$/, '') || '0';
}

function decodeImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match?.[1] || !match[2]) throw new Error('OpenRouter returned an invalid image payload.');
  return {
    bytes: new Uint8Array(Buffer.from(match[2], 'base64')),
    contentType: match[1],
  };
}

function getImageExtension(contentType: string) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  return 'png';
}

function getGenerationErrorCode(error: unknown) {
  if (error instanceof GenerationIdempotencyConflictError) return 'idempotency_conflict';
  if (error instanceof GenerationJobTransitionError) return 'transition_conflict';
  return 'provider_or_storage_error';
}

function isRetryableGenerationError(error: unknown) {
  const status = getOpenRouterErrorStatus(error);
  return status === 408 || status === 429 || status >= 500;
}
