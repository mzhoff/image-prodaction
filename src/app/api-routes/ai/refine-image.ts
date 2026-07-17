import { createHash } from 'node:crypto';
import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import type { OpenRouterMessageContentImage, OpenRouterMessageContentText } from '@/shared/api/openrouter';
import { DEFAULT_IMAGE_MODEL, PREFERRED_IMAGE_MODEL_IDS, getImageModelConfig } from '@/shared/api/openrouter-models';
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
import {
  markOpenRouterProviderUsed,
  ProviderConnectionNotConfiguredError,
  resolveOpenRouterCredential,
} from '@/modules/provider-connections/server/provider-connection-service';
import { ProviderCredentialConfigurationError } from '@/modules/provider-connections/server/credential-crypto-config';
import { recordUsageEvent } from '@/modules/usage';

export const runtime = 'nodejs';

const MAX_REFINE_REQUEST_BYTES = 9 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 6_500_000;

const refineModeSchema = z.enum(['reference-cleanup', 'detail-boost', 'high-res-redraw']);
const preserveStrengthSchema = z.enum(['strict', 'balanced', 'creative']);

const refineImageSchema = z.object({
  aspectRatio: z.string().min(1).default('1:1'),
  documentId: z.string().refine(isUuidV7),
  idempotencyKey: z.string().trim().min(1).max(255),
  imageDataUrl: z.string().min(1).max(MAX_IMAGE_DATA_URL_LENGTH),
  instruction: z.string().max(20_000).default(''),
  mode: refineModeSchema.default('reference-cleanup'),
  model: z.string().min(1).default(DEFAULT_IMAGE_MODEL),
  preserveStrength: preserveStrengthSchema.default('strict'),
  size: z.string().min(1).default('2K'),
  workspaceId: z.string().refine(isUuidV7),
});

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REFINE_REQUEST_BYTES) {
    return apiError('generation_request_too_large', 'Generation request is too large.', 413);
  }
  const parsed = refineImageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const imageConfig = getImageModelConfig(parsed.data.model);
  if (!imageConfig.aspectRatios.includes(parsed.data.aspectRatio) || !imageConfig.sizes.includes(parsed.data.size)) {
    return Response.json({ error: 'Aspect ratio or size is not available for selected model.' }, { status: 400 });
  }

  let startedJob: GenerationJobDto | null = null;
  let providerUsage: GenerationUsageInput | undefined;
  let providerOperationId: string | null = null;
  try {
    const session = await requireApiSession(request);
    const providerConnection = await resolveOpenRouterCredential(
      session.user.id,
      parsed.data.workspaceId,
    );
    if (!PREFERRED_IMAGE_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for image refine.` }, { status: 400 });
    }
    const job = await createGenerationJob({
      userId: session.user.id,
      workspaceId: parsed.data.workspaceId,
      documentId: parsed.data.documentId,
      provider: 'openrouter',
      modelId: parsed.data.model,
      operation: 'refine_image',
      idempotencyKey: parsed.data.idempotencyKey,
      metadata: {
        aspectRatio: parsed.data.aspectRatio,
        mode: parsed.data.mode,
        preserveStrength: parsed.data.preserveStrength,
        requestHash: createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex'),
        size: parsed.data.size,
      },
    });
    const replayResponse = await resolveTransientGenerationReplay(job);
    if (replayResponse) return replayResponse;
    startedJob = await startGenerationJob(job.id);

    const content: Array<OpenRouterMessageContentText | OpenRouterMessageContentImage> = [
      { type: 'text', text: composeRefinePrompt(parsed.data) },
      { type: 'text', text: 'Source image to refine. Use it as the primary identity, shape, composition, and texture reference.' },
      { type: 'image_url', image_url: { url: parsed.data.imageDataUrl } },
    ];

    console.info('[openrouter:image:refine] request', {
      aspectRatio: parsed.data.aspectRatio,
      mode: parsed.data.mode,
      model: parsed.data.model,
      preserveStrength: parsed.data.preserveStrength,
      size: parsed.data.size,
    });
    const result = await sendOpenRouterChat({
      apiKey: providerConnection.apiKey,
      model: parsed.data.model,
      messages: [{ role: 'user', content }],
      modalities: ['image', 'text'],
      imageConfig: {
        aspect_ratio: parsed.data.aspectRatio,
        image_size: parsed.data.size,
      },
    });
    providerOperationId = result.id ?? null;
    providerUsage = normalizeOpenRouterUsage(result.usage);
    await Promise.all([
      markOpenRouterProviderUsed(providerConnection.connection.id),
      recordUsageEvent({
        generationJobId: startedJob.id,
        attemptCount: startedJob.attemptCount,
        succeeded: true,
        inputTokens: providerUsage.inputTokens,
        outputTokens: providerUsage.outputTokens,
        totalTokens: providerUsage.totalTokens,
        providerCostUsd: providerUsage.providerCostUsd,
        providerOperationId,
      }),
    ]);

    const message = result.choices?.[0]?.message;
    const responseSummary = summarizeOpenRouterImageMessage(message);
    console.info('[openrouter:image:refine] response', {
      ...responseSummary,
      model: parsed.data.model,
    });
    const imageUrl = extractOpenRouterImageUrl(message);
    if (!imageUrl) {
      console.warn('[openrouter:image:refine] missing image payload', {
        ...responseSummary,
        model: parsed.data.model,
      });
      throw new Error(missingOpenRouterImageErrorWithContext('OpenRouter image refine', message));
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
      await recordUsageEvent({
        generationJobId: startedJob.id,
        attemptCount: startedJob.attemptCount,
        succeeded: false,
        inputTokens: providerUsage?.inputTokens ?? null,
        outputTokens: providerUsage?.outputTokens ?? null,
        totalTokens: providerUsage?.totalTokens ?? null,
        providerCostUsd: providerUsage?.providerCostUsd ?? null,
        providerOperationId,
        errorCode: getGenerationErrorCode(error),
      }).catch(() => undefined);
      await failGenerationJob({
        attemptCount: startedJob.attemptCount,
        errorCode: getGenerationErrorCode(error),
        errorMessage: formatOpenRouterError(error, 'Image refine failed'),
        jobId: startedJob.id,
        retryable: isRetryableTransientGenerationError(error),
        usage: providerUsage,
      }).catch((ledgerError: unknown) => {
        console.error('[generation:ledger] failed to record refine failure', ledgerError);
      });
    }
    if (error instanceof GenerationIdempotencyConflictError) {
      return apiError('generation_idempotency_conflict', error.message, 409);
    }
    if (error instanceof GenerationJobTransitionError) {
      return apiError('generation_job_conflict', error.message, 409);
    }
    if (error instanceof ProviderConnectionNotConfiguredError) {
      return apiError('provider_not_configured', error.message, 409);
    }
    if (error instanceof ProviderCredentialConfigurationError) {
      return apiError(
        'provider_credentials_not_configured',
        'Server credential encryption is not configured.',
        503,
      );
    }
    const baseResponse = toApiErrorResponse(error);
    if (baseResponse.status !== 500) return baseResponse;
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter image refine failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}

function getGenerationErrorCode(error: unknown) {
  if (error instanceof GenerationIdempotencyConflictError) return 'idempotency_conflict';
  if (error instanceof GenerationJobTransitionError) return 'transition_conflict';
  return 'provider_error';
}

function composeRefinePrompt({
  instruction,
  mode,
  preserveStrength,
}: z.infer<typeof refineImageSchema>) {
  const modeInstruction = {
    'reference-cleanup': 'Clean artifacts, compression, noise, edge dirt, and weak details while keeping the source identity and design stable.',
    'detail-boost': 'Increase perceived detail, clarity, texture fidelity, and production quality without redesigning the subject.',
    'high-res-redraw': 'Create a high-quality redraw that preserves the same subject, silhouette, proportions, composition, and key visual traits.',
  }[mode];
  const preserveInstruction = {
    strict: 'Preservation is strict: do not alter identity, shape, logo, face structure, proportions, color scheme, pose, framing, or composition.',
    balanced: 'Preservation is balanced: keep identity, shape, proportions, and composition while improving weak visual details.',
    creative: 'Preservation is flexible: improve production quality while keeping the subject recognizable and the original composition readable.',
  }[preserveStrength];

  return [
    'You are an AI production image refiner.',
    'Task: improve the supplied image so it becomes a stronger reusable reference asset.',
    '',
    'Important:',
    '- This is generative refine, not mathematically exact pixel upscale.',
    '- Keep the source image as the primary reference.',
    '- Do not add text, logos, labels, watermarks, unrelated props, or extra subjects.',
    '- Preserve transparent/background intent where possible.',
    '',
    `Mode: ${mode}`,
    modeInstruction,
    '',
    `Preserve strength: ${preserveStrength}`,
    preserveInstruction,
    '',
    'User instruction:',
    instruction.trim() || 'Improve the image quality while preserving the subject identity and production usefulness.',
  ].join('\n');
}
