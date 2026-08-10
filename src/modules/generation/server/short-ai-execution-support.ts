import type { GenerationUsageInput } from '@/entities/generation/server/generation-orchestrator';
import {
  EMPTY_PROVIDER_USAGE,
  ProviderHttpError,
  type ProviderUsage,
} from '@/modules/provider-connections';
import type { RecordUsageEventInput } from '@/modules/usage';
import type {
  ShortAiExecutionDependencies,
  ProviderCallResult,
} from './short-ai-execution-contracts';

export async function markProviderUsedSafely(
  dependencies: ShortAiExecutionDependencies,
  connectionId: string,
) {
  try {
    await dependencies.markProviderUsed(connectionId);
  } catch {
    console.error('OpenRouter provider last-used timestamp could not be updated.');
  }
}

export async function recordUsageReliably(
  dependencies: ShortAiExecutionDependencies,
  input: RecordUsageEventInput,
) {
  try {
    await dependencies.recordUsage(input);
  } catch {
    await dependencies.recordUsage(input);
  }
}

export function toGenerationUsage(usage: ProviderUsage): GenerationUsageInput {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    providerCostUsd: normalizeCost(usage.providerCostUsd),
    totalTokens: usage.totalTokens,
  };
}

export function normalizeCost(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed.toFixed(8).replace(/\.?0+$/, '') || '0';
}

export function readProviderFailureUsage(error: unknown): ProviderUsage {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current instanceof ProviderHttpError && current.usage) return current.usage;
    current = current.cause;
  }
  return { ...EMPTY_PROVIDER_USAGE };
}

export function createEmptyProviderCallResult<T>(
  result: T,
  providerOperationId: string | null = null,
): ProviderCallResult<T> {
  return { providerOperationId, result, usage: { ...EMPTY_PROVIDER_USAGE } };
}
