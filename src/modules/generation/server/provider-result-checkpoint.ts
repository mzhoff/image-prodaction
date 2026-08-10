import type { ProviderResult } from '@/modules/provider-connections';
import type { ProviderResultCheckpoint } from './image-generation-contracts';
import { GenerationExecutionError } from './generation-worker';
import {
  createGenerationPayloadKey,
  createGenerationPayloadStore,
} from './generation-payload-store';

export async function loadProviderCheckpoint(input: {
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
  const store = createGenerationPayloadStore();
  const value = input.resultObjectKey
    ? await store.read<unknown>(key)
    : await store.readOptional<unknown>(key);
  if (value === null) return null;
  return { checkpoint: assertProviderCheckpoint(value), key };
}

export async function writeProviderCheckpointReliably(
  payloadStore: ReturnType<typeof createGenerationPayloadStore>,
  input: Parameters<typeof payloadStore.write>[0],
) {
  try {
    return await payloadStore.write(input);
  } catch {
    return payloadStore.write(input);
  }
}

function assertProviderCheckpoint(value: unknown): ProviderResultCheckpoint {
  if (value && typeof value === 'object' && 'version' in value && value.version === 1
    && 'attemptCount' in value && Number.isSafeInteger(value.attemptCount)
    && Number(value.attemptCount) >= 1 && 'result' in value) {
    return {
      attemptCount: Number(value.attemptCount),
      result: assertProviderResult(value.result),
      version: 1,
    };
  }
  return { attemptCount: 1, result: assertProviderResult(value), version: 1 };
}

function assertProviderResult(value: unknown): ProviderResult {
  if (!value || typeof value !== 'object' || !('provider' in value)
    || value.provider !== 'openrouter' || !('modelId' in value)
    || typeof value.modelId !== 'string' || !('outputs' in value)
    || !Array.isArray(value.outputs) || !('usage' in value) || !value.usage) {
    throw new GenerationExecutionError({
      code: 'generation_checkpoint_invalid',
      message: 'Saved provider result is invalid.',
      retryable: false,
    });
  }
  return value as ProviderResult;
}
