import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import type { GenerateReferenceSlot } from '@/entities/production-graph/model/generate-prompt-builder';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import {
  GenerationIdempotencyConflictError,
  GenerationJobValidationError,
} from '@/entities/generation/server/generation-orchestrator';
import {
  ProviderConnectionNotConfiguredError,
  resolveOpenRouterCredential,
} from '@/modules/provider-connections/server/provider-connection-service';
import { ProviderCredentialConfigurationError } from '@/modules/provider-connections/server/credential-crypto-config';
import {
  submitGenerationJob,
  toPublicGenerationJob,
} from '@/modules/generation/server/generation-submission-service';
import type { QueuedGenerateImagePayload } from '@/modules/generation';
import { apiError } from '@/shared/api/api-error';
import { IMAGE_GENERATION_REQUEST_MAX_BYTES } from '@/shared/api/image-request-limits';
import { JsonRequestError, readBoundedJsonObject } from '@/shared/api/read-bounded-json';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { DEFAULT_IMAGE_MODEL } from '@/shared/api/openrouter-models';
import { imageGenerationOptionsSchema, pickImageGenerationOptions } from '@/shared/media/image-generation-settings';
import { ImageModelValidationError, openRouterImageCatalog } from '@/modules/provider-connections/adapters/openrouter-image-catalog';
import { isUuid } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export const runtime = 'nodejs';

const MAX_REFERENCE_DATA_URL_LENGTH = IMAGE_GENERATION_REQUEST_MAX_BYTES;
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
  ...imageGenerationOptionsSchema.shape,
  operation: z.literal('generate_image').optional(),
  documentId: z.string().refine(isUuid),
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
  workspaceId: z.string().refine(isUuid),
});

const referenceSlotIds = new Set<string>([
  'reference',
  ...productionLayers.map((layer) => layer.id),
]);
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
  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request, IMAGE_GENERATION_REQUEST_MAX_BYTES);
  } catch (error) {
    if (error instanceof JsonRequestError) return apiError(error.code, error.message, error.status);
    throw error;
  }
  const parsed = generateImageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const validationError = validateGenerationInput(parsed.data);
  if (validationError) return validationError;

  try {
    const session = await requireApiSession(request);
    await resolveOpenRouterCredential(session.user.id, parsed.data.workspaceId);
    await openRouterImageCatalog.resolve(parsed.data.model, parsed.data, parsed.data.referenceImages.length);
    const payload: QueuedGenerateImagePayload = {
      ...pickImageGenerationOptions(parsed.data),
      workspaceId: parsed.data.workspaceId,
      documentId: parsed.data.documentId,
      model: parsed.data.model,
      prompt: parsed.data.prompt,
      aspectRatio: parsed.data.aspectRatio,
      size: parsed.data.size,
      inputs: parsed.data.inputs,
      subjectInputs: parsed.data.subjectInputs,
      locationInputs: parsed.data.locationInputs,
      referenceImages: parsed.data.referenceImages,
    };
    const job = await submitGenerationJob({
      userId: session.user.id,
      workspaceId: payload.workspaceId,
      documentId: payload.documentId,
      provider: 'openrouter',
      modelId: payload.model,
      operation: 'generate_image',
      idempotencyKey: parsed.data.idempotencyKey,
      metadata: {
        aspectRatio: payload.aspectRatio,
        referenceCount: payload.referenceImages.length,
        requestHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        size: payload.size,
      },
      payload,
    });

    if (job.status === 'succeeded' && job.finalAssetId) {
      const asset = await getAssetMetadata(session.user.id, job.finalAssetId);
      return Response.json({
        asset,
        job: toPublicGenerationJob(job),
        provider: 'openrouter',
        usage: job.usage,
      });
    }
    if (job.status === 'failed' && !job.error?.retryable) {
      return apiError('generation_failed', job.error?.message ?? 'Generation failed.', 409, {
        details: { jobId: job.id },
      });
    }
    if (job.status === 'canceled') {
      return apiError('generation_canceled', 'Generation was canceled.', 409, {
        details: { jobId: job.id },
      });
    }
    return Response.json({
      job: toPublicGenerationJob(job),
      statusUrl: `/api/generation-jobs/${job.id}`,
    }, {
      status: 202,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': '1',
      },
    });
  } catch (error) {
    if (error instanceof ImageModelValidationError) {
      return apiError('generation_image_config_unavailable', error.message, 400);
    }
    if (error instanceof ProviderConnectionNotConfiguredError) {
      return apiError(error.code, error.message, 409);
    }
    if (error instanceof ProviderCredentialConfigurationError) {
      return apiError(
        'provider_credentials_not_configured',
        'Server credential encryption is not configured.',
        503,
      );
    }
    if (error instanceof GenerationIdempotencyConflictError) {
      return apiError('generation_idempotency_conflict', error.message, 409);
    }
    if (error instanceof GenerationJobValidationError) {
      return apiError('invalid_generation_job', error.message, 400);
    }
    return toApiErrorResponse(error);
  }
}

function validateGenerationInput(data: z.infer<typeof generateImageSchema>) {
  const hasPrompt = data.prompt.trim().length > 0;
  const hasStructuredText = Object.values(data.inputs).some((items) => items.length > 0);
  const hasSubjects = data.subjectInputs.some((item) => item.trim().length > 0);
  const hasLocations = data.locationInputs.some((item) => item.trim().length > 0);
  if (
    !hasPrompt
    && !hasStructuredText
    && !hasSubjects
    && !hasLocations
    && data.referenceImages.length === 0
  ) {
    return apiError(
      'generation_input_required',
      'Add a prompt or connect at least one reference.',
      400,
    );
  }
  return null;
}

function isGenerateReferenceSlot(value: unknown) {
  return typeof value === 'string' && referenceSlotIds.has(value);
}

function isProductionNodeType(value: unknown) {
  return typeof value === 'string' && productionNodeTypes.has(value);
}
