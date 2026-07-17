import { createHash } from 'node:crypto';
import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import type { OpenRouterMessageContentImage, OpenRouterMessageContentText } from '@/shared/api/openrouter';
import { DEFAULT_IMAGE_MODEL, getImageModelConfig, PREFERRED_IMAGE_MODEL_IDS } from '@/shared/api/openrouter-models';
import {
  createGenerationJob,
  failGenerationJob,
  GenerationIdempotencyConflictError,
  GenerationJobTransitionError,
  startGenerationJob,
  succeedGenerationJob,
  type GenerationJobDto,
  type GenerationUsageInput,
} from '@/entities/generation/server/generation-orchestrator';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';
import {
  extractOpenRouterImageUrl,
  extractOpenRouterMessageText,
  missingOpenRouterImageErrorWithContext,
  normalizeOpenRouterImageUrl,
  summarizeOpenRouterImageMessage,
} from './openrouter-image-result';
import {
  isRetryableTransientGenerationError,
  normalizeOpenRouterUsage,
  resolveTransientGenerationReplay,
} from './transient-generation-ledger';

export const runtime = 'nodejs';

const MAX_EDIT_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 6_500_000;

const editImageSchema = z.object({
  documentId: z.string().refine(isUuidV7),
  idempotencyKey: z.string().trim().min(1).max(255),
  model: z.string().min(1).default(DEFAULT_IMAGE_MODEL),
  prompt: z.string().min(1).max(20_000),
  imageDataUrl: z.string().min(1).max(MAX_IMAGE_DATA_URL_LENGTH),
  maskDataUrl: z.string().min(1).max(MAX_IMAGE_DATA_URL_LENGTH),
  aspectRatio: z.string().min(1).default('1:1'),
  size: z.string().min(1).default('1K'),
  workspaceId: z.string().refine(isUuidV7),
});

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_EDIT_REQUEST_BYTES) {
    return apiError('generation_request_too_large', 'Generation request is too large.', 413);
  }
  const parsed = editImageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const imageConfig = getImageModelConfig(parsed.data.model);
  if (!imageConfig.aspectRatios.includes(parsed.data.aspectRatio) || !imageConfig.sizes.includes(parsed.data.size)) {
    return Response.json({ error: 'Aspect ratio or size is not available for selected model.' }, { status: 400 });
  }

  let startedJob: GenerationJobDto | null = null;
  let providerUsage: GenerationUsageInput | undefined;
  try {
    const session = await requireApiSession(request);
    if (!process.env.OPENROUTER_API_KEY) {
      return apiError('openrouter_not_configured', 'OPENROUTER_API_KEY is not configured.', 503);
    }
    if (!PREFERRED_IMAGE_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for image editing.` }, { status: 400 });
    }
    const job = await createGenerationJob({
      userId: session.user.id,
      workspaceId: parsed.data.workspaceId,
      documentId: parsed.data.documentId,
      provider: 'openrouter',
      modelId: parsed.data.model,
      operation: 'edit_image',
      idempotencyKey: parsed.data.idempotencyKey,
      metadata: {
        aspectRatio: parsed.data.aspectRatio,
        requestHash: createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex'),
        size: parsed.data.size,
      },
    });
    const replayResponse = await resolveTransientGenerationReplay(job);
    if (replayResponse) return replayResponse;
    startedJob = await startGenerationJob(job.id);

    const content: Array<OpenRouterMessageContentText | OpenRouterMessageContentImage> = [
      { type: 'text', text: composeEditPrompt(parsed.data.prompt) },
      { type: 'text', text: 'Source image. Preserve all unmasked regions as much as possible.' },
      { type: 'image_url', image_url: { url: parsed.data.imageDataUrl } },
      { type: 'text', text: 'Mask image. White pixels define the only area allowed to change. Black pixels define protected areas.' },
      { type: 'image_url', image_url: { url: parsed.data.maskDataUrl } },
    ];

    console.info('[openrouter:image:edit] request', {
      aspectRatio: parsed.data.aspectRatio,
      model: parsed.data.model,
      size: parsed.data.size,
    });
    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [{ role: 'user', content }],
      modalities: ['image', 'text'],
      imageConfig: {
        aspect_ratio: parsed.data.aspectRatio,
        image_size: parsed.data.size,
      },
    });
    providerUsage = normalizeOpenRouterUsage(result.usage);

    const message = result.choices?.[0]?.message;
    const responseSummary = summarizeOpenRouterImageMessage(message);
    console.info('[openrouter:image:edit] response', {
      ...responseSummary,
      model: parsed.data.model,
    });
    const imageUrl = extractOpenRouterImageUrl(message);
    if (!imageUrl) {
      console.warn('[openrouter:image:edit] missing image payload', {
        ...responseSummary,
        model: parsed.data.model,
      });
      throw new Error(missingOpenRouterImageErrorWithContext('OpenRouter image edit', message));
    }
    const imageDataUrl = await normalizeOpenRouterImageUrl(imageUrl);
    const completedJob = await succeedGenerationJob({
      assetId: null,
      attemptCount: startedJob.attemptCount,
      jobId: startedJob.id,
      usage: providerUsage,
    });

    return Response.json({
      imageDataUrl,
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
        errorMessage: formatOpenRouterError(error, 'Image edit failed'),
        jobId: startedJob.id,
        retryable: isRetryableTransientGenerationError(error),
        usage: providerUsage,
      }).catch((ledgerError: unknown) => {
        console.error('[generation:ledger] failed to record edit failure', ledgerError);
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
      error: formatOpenRouterError(error, 'OpenRouter image edit failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}

function getGenerationErrorCode(error: unknown) {
  if (error instanceof GenerationIdempotencyConflictError) return 'idempotency_conflict';
  if (error instanceof GenerationJobTransitionError) return 'transition_conflict';
  return 'provider_error';
}

function composeEditPrompt(userPrompt: string) {
  return [
    'You are an AI image editor.',
    'Task: regenerate only the masked fragment of the source image.',
    '',
    'Inputs:',
    '- Image 1 is the source image.',
    '- Image 2 is a black-and-white mask.',
    '- White mask area is the edit region.',
    '- Black mask area is protected and must remain visually unchanged.',
    '',
    'Rules:',
    '- Do not redesign the whole image.',
    '- Do not change framing, composition, camera, lighting, color grade, text, people, objects, or background outside the white mask area.',
    '- Blend the edited region naturally into the surrounding pixels.',
    '- Keep the final image the same overall style and production quality as the source.',
    '',
    'User edit instruction:',
    userPrompt,
  ].join('\n');
}
