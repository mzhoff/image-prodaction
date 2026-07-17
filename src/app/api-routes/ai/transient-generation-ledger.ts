import {
  recoverExpiredGenerationJob,
  type GenerationJobDto,
  type GenerationUsageInput,
} from '@/entities/generation/server/generation-orchestrator';
import { apiError } from '@/shared/api/api-error';
import { getOpenRouterErrorStatus, type OpenRouterUsage } from '@/shared/api/openrouter';

export async function resolveTransientGenerationReplay(job: GenerationJobDto) {
  if (!job.idempotentReplay) return null;
  if (job.status === 'succeeded') {
    return apiError(
      'transient_generation_already_completed',
      'This generation completed, but its transient result is no longer replayable. Run it again as a new request.',
      409,
      { details: { jobId: job.id } },
    );
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

export function normalizeOpenRouterUsage(usage: OpenRouterUsage | undefined): GenerationUsageInput {
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

export function isRetryableTransientGenerationError(error: unknown) {
  const status = getOpenRouterErrorStatus(error);
  return status === 408 || status === 429 || status >= 500;
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
