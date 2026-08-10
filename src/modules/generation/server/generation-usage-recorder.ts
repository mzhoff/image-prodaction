import {
  ProviderHttpError,
  type ProviderResult,
  type ProviderUsage,
} from '@/modules/provider-connections';
import { recordUsageEvent } from '@/modules/usage';
import { GenerationExecutionError } from './generation-worker';
import type { getGenerationExecutionRecord } from './generation-execution-repository';

export function toGenerationUsage(result: ProviderResult) {
  return toGenerationUsageFromProviderUsage(result.usage);
}

export function toGenerationUsageFromProviderUsage(usage: ProviderUsage) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    providerCostUsd: usage.providerCostUsd,
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
  };
}

export function emptyUsage() {
  return {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    providerCostUsd: null,
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
  };
}

export function usageMissingFromJobLedger(
  job: Awaited<ReturnType<typeof getGenerationExecutionRecord>>,
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

export async function recordSuccessfulUsage(
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
    await persistUsageTwice(input);
  } catch {
    throw new GenerationExecutionError({
      code: 'usage_persistence_failed',
      message: 'Provider usage could not be durably recorded.',
      retryable,
      usage: toGenerationUsage(result),
    });
  }
}

export async function recordUsageEventWithRetry(
  input: Parameters<typeof recordUsageEvent>[0],
  usage: ProviderUsage,
) {
  try {
    await persistUsageTwice(input);
  } catch {
    throw new GenerationExecutionError({
      code: 'usage_persistence_failed',
      message: 'Provider usage could not be durably recorded.',
      retryable: false,
      usage: toGenerationUsageFromProviderUsage(usage),
    });
  }
}

export function readProviderFailureUsage(error: unknown): ProviderUsage {
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

async function persistUsageTwice(input: Parameters<typeof recordUsageEvent>[0]) {
  try {
    await recordUsageEvent(input);
  } catch {
    await recordUsageEvent(input);
  }
}
