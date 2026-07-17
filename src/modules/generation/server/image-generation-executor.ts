import { and, eq, isNull } from 'drizzle-orm';
import { normalizeOpenRouterImageUrl } from '@/app/api-routes/ai/openrouter-image-result';
import {
  getGeneratedAssetByJobId,
  getMaxImageUploadBytes,
  uploadImageAsset,
} from '@/entities/asset/server/asset-service';
import type {
  GenerateLayerInputs,
  GenerateReferenceSlot,
} from '@/entities/production-graph/model/generate-prompt-builder';
import {
  composeGenerationPrompt,
  composeReferenceImageInstruction,
} from '@/entities/production-graph/model/generate-prompt-builder';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import {
  ProviderAdapterError,
  ProviderHttpError,
  type ProviderImageOutput,
  type ProviderMessagePart,
  type ProviderResult,
  type ProviderUsage,
} from '@/modules/provider-connections';
import {
  markOpenRouterProviderUsed,
  resolveOpenRouterCredentialForWorkspace,
} from '@/modules/provider-connections/server/provider-connection-service';
import { createRuntimeOpenRouterAdapter } from '@/modules/provider-connections/server/runtime-provider-adapter';
import { recordUsageEvent } from '@/modules/usage';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import {
  GenerationExecutionError,
  type GenerationExecutionResult,
  type GenerationExecutor,
} from './generation-worker';
import {
  createGenerationPayloadKey,
  createGenerationPayloadStore,
} from './generation-payload-store';

export interface QueuedGenerateImagePayload {
  aspectRatio: string;
  documentId: string;
  inputs: GenerateLayerInputs;
  locationInputs: string[];
  model: string;
  prompt: string;
  referenceImages: Array<{
    dataUrl: string;
    slots: GenerateReferenceSlot[];
    sourceAssetId?: string;
    sourceNodeTypes?: ProductionNodeType[];
  }>;
  size: string;
  subjectInputs: string[];
  workspaceId: string;
}

interface ProviderResultCheckpoint {
  attemptCount: number;
  result: ProviderResult;
  version: 1;
}

export function createImageGenerationExecutor(): GenerationExecutor {
  const payloadStore = createGenerationPayloadStore();
  const provider = createRuntimeOpenRouterAdapter();

  return {
    async execute({ job, signal }): Promise<GenerationExecutionResult> {
      if (job.operation !== 'generate_image') {
        throw executionError(
          'unsupported_generation_operation',
          `Worker cannot execute operation ${job.operation}.`,
          false,
        );
      }
      if (!job.requestObjectKey) {
        throw executionError(
          'generation_payload_missing',
          'Generation request payload is missing.',
          false,
        );
      }

      const jobRecord = await getGenerationJobRecord(job.id);
      await assertActiveGenerationAttempt(job.id, job.attemptCount, signal);
      const savedCheckpoint = await loadProviderCheckpoint({
        checkpointAttemptCount: jobRecord.providerDispatchedAttempt,
        jobId: job.id,
        resultObjectKey: jobRecord.resultObjectKey,
        workspaceId: job.workspaceId,
      });
      const existingAsset = await getGeneratedAssetByJobId(job.id);
      if (existingAsset?.status === 'ready') {
        await assertActiveGenerationAttempt(job.id, job.attemptCount, signal);
        if (savedCheckpoint) {
          await recordSuccessfulUsage(
            job.id,
            savedCheckpoint.checkpoint.attemptCount,
            savedCheckpoint.checkpoint.result,
            true,
          );
        }
        return {
          assetId: existingAsset.id,
          usage: savedCheckpoint
            ? usageMissingFromJobLedger(jobRecord, savedCheckpoint.checkpoint.result)
            : emptyUsage(),
        };
      }

      const payload = await payloadStore.read<QueuedGenerateImagePayload>(
        job.requestObjectKey,
      );
      assertPayloadScope(payload, job.workspaceId, job.documentId);
      let result: ProviderResult;
      let providerCalled = false;
      let usageAttemptCount = job.attemptCount;
      if (savedCheckpoint) {
        result = savedCheckpoint.checkpoint.result;
        usageAttemptCount = savedCheckpoint.checkpoint.attemptCount;
        if (!jobRecord.resultObjectKey) {
          await saveProviderCheckpoint({
            attemptCount: job.attemptCount,
            jobId: job.id,
            providerOperationId: result.providerOperationId,
            resultObjectKey: savedCheckpoint.key,
          });
        }
        await recordSuccessfulUsage(
          job.id,
          usageAttemptCount,
          result,
          true,
        );
      } else {
        const resolvedCredential = await resolveOpenRouterCredentialForWorkspace(
          job.workspaceId,
        );
        if (jobRecord.providerDispatchedAt && !jobRecord.providerOperationId) {
          throw new GenerationExecutionError({
            code: 'provider_outcome_unknown',
            message:
              'A previous provider call was dispatched without a durable response. Automatic retry is blocked to prevent duplicate charges.',
            retryable: false,
          });
        }
        if (jobRecord.providerOperationId) {
          const status = await provider.getOperationStatus(
            jobRecord.providerOperationId,
            {
              credential: resolvedCredential.apiKey,
              signal,
            },
          );
          await recordUsageEventWithRetry({
            generationJobId: job.id,
            attemptCount: Math.max(1, job.attemptCount - 1),
            succeeded: status.state === 'succeeded',
            inputTokens: status.usage.inputTokens,
            outputTokens: status.usage.outputTokens,
            totalTokens: status.usage.totalTokens,
            providerCostUsd: status.usage.providerCostUsd,
            providerOperationId: status.providerOperationId,
            errorCode: status.error?.code ?? 'provider_reconciliation_required',
            metadata: {
              classification: status.error?.classification ?? 'ambiguous',
              reconciliationState: status.state,
            },
          }, status.usage);
          throw new GenerationExecutionError({
            code: 'provider_reconciliation_required',
            message: 'The previous provider operation was accepted but its image result cannot be safely replayed.',
            retryable: false,
            usage: toGenerationUsageFromProviderUsage(status.usage),
          });
        }
        await assertActiveGenerationAttempt(job.id, job.attemptCount, signal);
        await markProviderCallDispatched(job.id, job.attemptCount);
        try {
          providerCalled = true;
          result = await provider.execute(createProviderRequest(payload), {
            credential: resolvedCredential.apiKey,
            signal,
          });
        } catch (error) {
          const failureUsage = readProviderFailureUsage(error);
          const providerError = error instanceof ProviderAdapterError
            ? error
            : new ProviderAdapterError(provider.classifyError(error, {
              requestDispatched: true,
            }), error);
          await recordUsageEventWithRetry({
            generationJobId: job.id,
            attemptCount: job.attemptCount,
            succeeded: false,
            inputTokens: failureUsage.inputTokens,
            outputTokens: failureUsage.outputTokens,
            totalTokens: failureUsage.totalTokens,
            providerCostUsd: failureUsage.providerCostUsd,
            providerOperationId: providerError.descriptor.providerOperationId,
            errorCode: providerError.descriptor.code,
            metadata: {
              classification: providerError.descriptor.classification,
            },
          }, failureUsage);
          if (providerError.descriptor.providerOperationId) {
            await saveProviderOperationId({
              attemptCount: job.attemptCount,
              jobId: job.id,
              providerOperationId: providerError.descriptor.providerOperationId,
            });
          } else if (providerError.descriptor.classification !== 'ambiguous') {
            await clearProviderCallDispatch(job.id, job.attemptCount);
          }
          throw new GenerationExecutionError({
            code: providerError.descriptor.code,
            message: providerError.descriptor.message,
            retryable: providerError.descriptor.classification === 'retryable'
              && providerError.descriptor.providerOperationId === null,
            usage: toGenerationUsageFromProviderUsage(failureUsage),
          });
        }

        await markOpenRouterProviderUsed(
          resolvedCredential.connection.id,
        ).catch(logProviderUsageMarkerFailure);
        await recordSuccessfulUsage(job.id, job.attemptCount, result, true);
        const checkpoint: ProviderResultCheckpoint = {
          attemptCount: job.attemptCount,
          result,
          version: 1,
        };
        let resultObjectKey: string;
        try {
          resultObjectKey = await writeProviderCheckpointReliably(payloadStore, {
            attemptCount: job.attemptCount,
            jobId: job.id,
            kind: 'result',
            payload: checkpoint,
            workspaceId: job.workspaceId,
          });
        } catch {
          throw new GenerationExecutionError({
            code: 'generation_checkpoint_failed',
            message: 'Provider result could not be durably checkpointed.',
            retryable: false,
            usage: toGenerationUsage(result),
          });
        }
        try {
          await saveProviderCheckpoint({
            attemptCount: job.attemptCount,
            jobId: job.id,
            providerOperationId: result.providerOperationId,
            resultObjectKey,
          });
        } catch {
          throw new GenerationExecutionError({
            code: 'generation_checkpoint_link_failed',
            message: 'Provider result was saved but could not be linked to the job yet.',
            retryable: true,
            usage: toGenerationUsage(result),
          });
        }
      }

      try {
        const imageOutput = result.outputs.find(
          (output): output is ProviderImageOutput => output.modality === 'image',
        );
        if (!imageOutput) {
          throw new GenerationExecutionError({
            code: 'missing_modality',
            message: 'Provider completed without an image result.',
            retryable: false,
            usage: providerCalled ? toGenerationUsage(result) : undefined,
          });
        }
        await assertActiveGenerationAttempt(job.id, job.attemptCount, signal);
        const imageDataUrl = await normalizeOpenRouterImageUrl(
          toImageUrl(imageOutput),
          { maxBytes: getMaxImageUploadBytes() },
        );
        const image = decodeImageDataUrl(imageDataUrl);
        const uploadedAsset = await uploadImageAsset({
          bytes: image.bytes,
          claimedContentType: image.contentType,
          documentId: payload.documentId,
          generationJobId: job.id,
          libraryVisible: false,
          maxBytes: getMaxImageUploadBytes(),
          metadata: {
            aspectRatio: payload.aspectRatio,
            generationId: result.providerOperationId,
            responseModel: result.modelId,
            size: payload.size,
          },
          modelId: payload.model,
          operation: 'generate_image',
          origin: 'generated',
          originalName: `generated-${job.id}.${getImageExtension(image.contentType)}`,
          provider: 'openrouter',
          userId: jobRecord.createdByUserId,
          workspaceId: payload.workspaceId,
        });
        return {
          assetId: uploadedAsset.id,
          usage: usageMissingFromJobLedger(jobRecord, result),
        };
      } catch (error) {
        if (error instanceof GenerationExecutionError) throw error;
        throw new GenerationExecutionError({
          code: 'generation_output_persistence_failed',
          message: 'Generated image could not be persisted. The saved provider result will be retried.',
          retryable: true,
          usage: providerCalled ? toGenerationUsage(result) : undefined,
        });
      }
    },
  };
}

function createProviderRequest(payload: QueuedGenerateImagePayload) {
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
      {
        modality: 'text',
        text: composeReferenceImageInstruction(reference, index + 1),
      },
      {
        modality: 'image',
        data: reference.dataUrl,
      },
    ]),
  ];
  return {
    expectedOutputModalities: ['image'] as Array<'image'>,
    messages: [{ role: 'user' as const, parts }],
    modelId: payload.model,
    operation: 'generate_image',
    parameters: {
      image: {
        aspectRatio: payload.aspectRatio,
        size: payload.size,
      },
    },
  };
}

async function getGenerationJobRecord(jobId: string) {
  const [record] = await getDb().select().from(generationJob)
    .where(eq(generationJob.id, jobId))
    .limit(1);
  if (!record) {
    throw executionError(
      'generation_job_missing',
      'Generation job no longer exists.',
      false,
    );
  }
  return record;
}

async function saveProviderCheckpoint(input: {
  attemptCount: number;
  jobId: string;
  providerOperationId: string | null;
  resultObjectKey: string;
}) {
  const [updated] = await getDb().update(generationJob).set({
    providerOperationId: input.providerOperationId,
    resultObjectKey: input.resultObjectKey,
    updatedAt: new Date(),
  }).where(and(
    eq(generationJob.id, input.jobId),
    eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, input.attemptCount),
  )).returning({ id: generationJob.id });
  if (!updated) throw new Error('Generation job lease was lost before checkpoint.');
}

async function saveProviderOperationId(input: {
  attemptCount: number;
  jobId: string;
  providerOperationId: string;
}) {
  const [updated] = await getDb().update(generationJob).set({
    providerOperationId: input.providerOperationId,
    updatedAt: new Date(),
  }).where(and(
    eq(generationJob.id, input.jobId),
    eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, input.attemptCount),
    isNull(generationJob.cancelRequestedAt),
  )).returning({ id: generationJob.id });
  if (!updated) {
    throw executionError(
      'generation_attempt_canceled',
      'Generation attempt no longer owns the job.',
      false,
    );
  }
}

async function markProviderCallDispatched(jobId: string, attemptCount: number) {
  const now = new Date();
  const [updated] = await getDb().update(generationJob).set({
    providerDispatchedAt: now,
    providerDispatchedAttempt: attemptCount,
    updatedAt: now,
  }).where(and(
    eq(generationJob.id, jobId),
    eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, attemptCount),
    isNull(generationJob.cancelRequestedAt),
    isNull(generationJob.providerDispatchedAt),
  )).returning({ id: generationJob.id });
  if (!updated) {
    throw executionError(
      'generation_attempt_canceled',
      'Generation attempt no longer owns the provider dispatch.',
      false,
    );
  }
}

async function clearProviderCallDispatch(jobId: string, attemptCount: number) {
  const [updated] = await getDb().update(generationJob).set({
    providerDispatchedAt: null,
    providerDispatchedAttempt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(generationJob.id, jobId),
    eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, attemptCount),
    eq(generationJob.providerDispatchedAttempt, attemptCount),
    isNull(generationJob.cancelRequestedAt),
  )).returning({ id: generationJob.id });
  if (!updated) {
    throw executionError(
      'generation_attempt_canceled',
      'Generation attempt no longer owns the provider dispatch.',
      false,
    );
  }
}

async function assertActiveGenerationAttempt(
  jobId: string,
  attemptCount: number,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    throw executionError(
      'generation_attempt_canceled',
      'Generation attempt was canceled or lost its lease.',
      false,
    );
  }
  const [record] = await getDb().select({ id: generationJob.id }).from(generationJob)
    .where(and(
      eq(generationJob.id, jobId),
      eq(generationJob.status, 'running'),
      eq(generationJob.attemptCount, attemptCount),
      isNull(generationJob.cancelRequestedAt),
    ))
    .limit(1);
  if (!record) {
    throw executionError(
      'generation_attempt_canceled',
      'Generation attempt was canceled or lost its lease.',
      false,
    );
  }
}

async function loadProviderCheckpoint(input: {
  checkpointAttemptCount: number | null;
  jobId: string;
  resultObjectKey: string | null;
  workspaceId: string;
}) {
  const key = input.resultObjectKey ?? createGenerationPayloadKey({
    attemptCount: input.checkpointAttemptCount ?? undefined,
    jobId: input.jobId,
    kind: 'result',
    workspaceId: input.workspaceId,
  });
  if (!input.resultObjectKey && input.checkpointAttemptCount === null) return null;
  const value = input.resultObjectKey
    ? await createGenerationPayloadStore().read<unknown>(key)
    : await createGenerationPayloadStore().readOptional<unknown>(key);
  if (value === null) return null;
  return {
    checkpoint: assertProviderCheckpoint(value),
    key,
  };
}

async function writeProviderCheckpointReliably(
  payloadStore: ReturnType<typeof createGenerationPayloadStore>,
  input: Parameters<typeof payloadStore.write>[0],
) {
  try {
    return await payloadStore.write(input);
  } catch {
    return payloadStore.write(input);
  }
}

function toGenerationUsage(result: ProviderResult) {
  return toGenerationUsageFromProviderUsage(result.usage);
}

function toGenerationUsageFromProviderUsage(usage: ProviderUsage) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    providerCostUsd: usage.providerCostUsd,
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
  };
}

function emptyUsage() {
  return {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    providerCostUsd: null,
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
  };
}

function usageMissingFromJobLedger(
  job: Awaited<ReturnType<typeof getGenerationJobRecord>>,
  result: ProviderResult,
) {
  return {
    inputTokens: job.inputTokens === null ? result.usage.inputTokens : null,
    outputTokens: job.outputTokens === null ? result.usage.outputTokens : null,
    totalTokens: job.totalTokens === null ? result.usage.totalTokens : null,
    providerCostUsd: job.providerCostUsd === null ? result.usage.providerCostUsd : null,
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
  };
}

function assertPayloadScope(
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

function toImageUrl(output: ProviderImageOutput) {
  if (output.url) return output.url;
  if (!output.data || !output.mediaType) {
    throw executionError(
      'invalid_image_result',
      'Provider returned an invalid image payload.',
      false,
    );
  }
  return `data:${output.mediaType};base64,${output.data}`;
}

function decodeImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s);
  if (!match) {
    throw executionError(
      'invalid_image_result',
      'Provider returned an unsupported image format.',
      false,
    );
  }
  return {
    contentType: match[1],
    bytes: new Uint8Array(Buffer.from(match[2], 'base64')),
  };
}

function getImageExtension(contentType: string) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  return 'png';
}

function executionError(code: string, message: string, retryable: boolean) {
  return new GenerationExecutionError({ code, message, retryable });
}

function logProviderUsageMarkerFailure(error: unknown) {
  console.error('[generation:provider] failed to update last-used timestamp', {
    error: error instanceof Error ? error.message : 'unknown error',
  });
}

async function recordSuccessfulUsage(
  generationJobId: string,
  attemptCount: number,
  result: ProviderResult,
  retryable: boolean,
) {
  const input = {
    generationJobId,
    attemptCount,
    succeeded: true,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    totalTokens: result.usage.totalTokens,
    providerCostUsd: result.usage.providerCostUsd,
    providerOperationId: result.providerOperationId,
    metadata: {
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      reasoningTokens: result.usage.reasoningTokens,
    },
  };
  try {
    await recordUsageEvent(input);
  } catch {
    try {
      await recordUsageEvent(input);
    } catch {
      throw new GenerationExecutionError({
        code: 'usage_persistence_failed',
        message: 'Provider usage could not be durably recorded.',
        retryable,
        usage: toGenerationUsage(result),
      });
    }
  }
}

async function recordUsageEventWithRetry(
  input: Parameters<typeof recordUsageEvent>[0],
  usage: ProviderUsage,
) {
  try {
    await recordUsageEvent(input);
  } catch {
    try {
      await recordUsageEvent(input);
    } catch {
      throw new GenerationExecutionError({
        code: 'usage_persistence_failed',
        message: 'Provider usage could not be durably recorded.',
        retryable: false,
        usage: toGenerationUsageFromProviderUsage(usage),
      });
    }
  }
}

function readProviderFailureUsage(error: unknown): ProviderUsage {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current instanceof ProviderHttpError && current.usage) return current.usage;
    current = current.cause;
  }
  return {
    cacheReadTokens: null,
    cacheWriteTokens: null,
    complete: false,
    inputTokens: null,
    outputTokens: null,
    providerCostUsd: null,
    reasoningTokens: null,
    totalTokens: null,
  };
}

function assertProviderCheckpoint(value: unknown): ProviderResultCheckpoint {
  if (
    value
    && typeof value === 'object'
    && 'version' in value
    && value.version === 1
    && 'attemptCount' in value
    && Number.isSafeInteger(value.attemptCount)
    && Number(value.attemptCount) >= 1
    && 'result' in value
  ) {
    return {
      attemptCount: Number(value.attemptCount),
      result: assertProviderResult(value.result),
      version: 1,
    };
  }
  return {
    attemptCount: 1,
    result: assertProviderResult(value),
    version: 1,
  };
}

function assertProviderResult(value: unknown): ProviderResult {
  if (
    !value
    || typeof value !== 'object'
    || !('provider' in value)
    || value.provider !== 'openrouter'
    || !('modelId' in value)
    || typeof value.modelId !== 'string'
    || !('outputs' in value)
    || !Array.isArray(value.outputs)
    || !('usage' in value)
    || !value.usage
  ) {
    throw executionError(
      'generation_checkpoint_invalid',
      'Saved provider result is invalid.',
      false,
    );
  }
  return value as ProviderResult;
}
