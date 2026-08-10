import { getGeneratedAssetByJobId } from '@/entities/asset/server/asset-service';
import { createRuntimeOpenRouterAdapter } from '@/modules/provider-connections/server/runtime-provider-adapter';
import {
  assertActiveGenerationAttempt,
  getGenerationExecutionRecord,
} from './generation-execution-repository';
import {
  emptyUsage,
  recordSuccessfulUsage,
  toGenerationUsage,
  usageMissingFromJobLedger,
} from './generation-usage-recorder';
import { persistGeneratedImage } from './generated-image-persistence';
import type { QueuedGenerateImagePayload } from './image-generation-contracts';
import { executeImageProvider } from './image-provider-execution';
import { assertPayloadScope } from './image-provider-request';
import {
  GenerationExecutionError,
  type GenerationExecutionResult,
  type GenerationExecutor,
} from './generation-worker';
import { createGenerationPayloadStore } from './generation-payload-store';
import { loadProviderCheckpoint } from './provider-result-checkpoint';

export type { QueuedGenerateImagePayload } from './image-generation-contracts';

export function createImageGenerationExecutor(): GenerationExecutor {
  const payloadStore = createGenerationPayloadStore();
  const provider = createRuntimeOpenRouterAdapter();
  return {
    async execute({ job, signal }): Promise<GenerationExecutionResult> {
      assertExecutableJob(job.operation, job.requestObjectKey);
      const jobRecord = await getGenerationExecutionRecord(job.id);
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

      const payload = await payloadStore.read<QueuedGenerateImagePayload>(job.requestObjectKey!);
      assertPayloadScope(payload, job.workspaceId, job.documentId);
      const execution = await executeImageProvider({
        job,
        jobRecord,
        payload,
        payloadStore,
        provider,
        savedCheckpoint,
        signal,
      });
      try {
        await assertActiveGenerationAttempt(job.id, job.attemptCount, signal);
        const uploadedAsset = await persistGeneratedImage({
          job,
          jobRecord,
          payload,
          providerCalled: execution.providerCalled,
          result: execution.result,
        });
        return {
          assetId: uploadedAsset.id,
          usage: usageMissingFromJobLedger(jobRecord, execution.result),
        };
      } catch (error) {
        if (error instanceof GenerationExecutionError) throw error;
        throw new GenerationExecutionError({
          code: 'generation_output_persistence_failed',
          message: 'Generated image could not be persisted. The saved provider result will be retried.',
          retryable: true,
          usage: execution.providerCalled ? toGenerationUsage(execution.result) : undefined,
        });
      }
    },
  };
}

function assertExecutableJob(operation: string, requestObjectKey: string | null | undefined) {
  if (operation !== 'generate_image') {
    throw new GenerationExecutionError({
      code: 'unsupported_generation_operation',
      message: `Worker cannot execute operation ${operation}.`,
      retryable: false,
    });
  }
  if (!requestObjectKey) {
    throw new GenerationExecutionError({
      code: 'generation_payload_missing',
      message: 'Generation request payload is missing.',
      retryable: false,
    });
  }
}
