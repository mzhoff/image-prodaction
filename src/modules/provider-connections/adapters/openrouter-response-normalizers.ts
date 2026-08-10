import {
  type ProviderCredentialSummary,
  type ProviderExecuteRequest,
  type ProviderModel,
  type ProviderOperationStatus,
  type ProviderResult,
  type ProviderSafeMetadata,
  type ProviderUsage,
} from '../contracts/provider-contracts';
import { createInvalidProviderResponseError, createMissingModalityError } from '../core/provider-errors';
import { normalizeOpenRouterOutputs } from './openrouter-message-mapping';
import {
  asRecord,
  normalizeModalities,
  readDecimal,
  readString,
  readToken,
  setSafeMetadata,
  uniqueModalities,
} from './openrouter-value-readers';

const PROVIDER = 'openrouter';

export function extractOpenRouterFailureUsage(raw: unknown) {
  const payload = asRecord(raw);
  const error = asRecord(payload?.error);
  const metadata = asRecord(error?.metadata);
  const candidates = [payload?.usage, asRecord(payload?.data)?.usage, error?.usage, metadata?.usage];
  for (const candidate of candidates) {
    const usage = normalizeOpenRouterProviderUsage(candidate);
    if (usage.inputTokens !== null || usage.outputTokens !== null
      || usage.totalTokens !== null || usage.providerCostUsd !== null) return usage;
  }
  return null;
}

export function normalizeOpenRouterProviderUsage(rawUsage: unknown): ProviderUsage {
  const usage = asRecord(rawUsage);
  const promptDetails = asRecord(usage?.prompt_tokens_details);
  const completionDetails = asRecord(usage?.completion_tokens_details);
  const inputTokens = readToken(usage?.prompt_tokens);
  const outputTokens = readToken(usage?.completion_tokens);
  const totalTokens = readToken(usage?.total_tokens);
  return {
    cacheReadTokens: readToken(promptDetails?.cached_tokens ?? usage?.cache_read_tokens ?? usage?.cached_tokens),
    cacheWriteTokens: readToken(promptDetails?.cache_write_tokens ?? usage?.cache_write_tokens),
    complete: inputTokens !== null && outputTokens !== null && totalTokens !== null,
    inputTokens,
    outputTokens,
    providerCostUsd: readDecimal(usage?.cost),
    reasoningTokens: readToken(completionDetails?.reasoning_tokens ?? usage?.reasoning_tokens),
    totalTokens,
  };
}

export function normalizeOpenRouterResult(raw: unknown, request: ProviderExecuteRequest): ProviderResult {
  const payload = asRecord(raw);
  if (!payload) throw createInvalidProviderResponseError();
  const providerOperationId = readString(payload, 'id');
  const choice = asRecord(Array.isArray(payload.choices) ? payload.choices[0] : null);
  const message = asRecord(choice?.message);
  if (!message) throw createInvalidProviderResponseError(providerOperationId);
  const outputs = normalizeOpenRouterOutputs(message);
  const actualModalities = new Set(outputs.map((output) => output.modality));
  const missingModalities = uniqueModalities(request.expectedOutputModalities)
    .filter((modality) => !actualModalities.has(modality));
  if (missingModalities.length > 0) {
    throw createMissingModalityError({
      actualModalities: Array.from(actualModalities),
      expectedModalities: missingModalities,
      providerOperationId,
    });
  }
  const metadata: ProviderSafeMetadata = {};
  setSafeMetadata(metadata, 'finishReason', choice?.finish_reason);
  setSafeMetadata(metadata, 'nativeFinishReason', choice?.native_finish_reason);
  setSafeMetadata(metadata, 'upstreamProvider', payload.provider);
  return {
    metadata,
    modelId: readString(payload, 'model') ?? request.modelId,
    outputs,
    provider: PROVIDER,
    providerOperationId,
    usage: normalizeOpenRouterProviderUsage(payload.usage),
  };
}

export function normalizeOpenRouterCredentialSummary(raw: unknown): ProviderCredentialSummary {
  const data = asRecord(asRecord(raw)?.data);
  if (!data) throw createInvalidProviderResponseError();
  return {
    isFreeTier: typeof data.is_free_tier === 'boolean' ? data.is_free_tier : null,
    label: typeof data.label === 'string' ? data.label : null,
    limitRemainingUsd: readDecimal(data.limit_remaining),
    limitReset: typeof data.limit_reset === 'string' ? data.limit_reset : null,
    limitUsd: readDecimal(data.limit),
    usageDailyUsd: readDecimal(data.usage_daily),
    usageMonthlyUsd: readDecimal(data.usage_monthly),
    usageTotalUsd: readDecimal(data.usage),
    usageWeeklyUsd: readDecimal(data.usage_weekly),
  };
}

export function normalizeOpenRouterModels(raw: unknown): ProviderModel[] {
  const payload = asRecord(raw);
  if (!Array.isArray(payload?.data)) throw createInvalidProviderResponseError();
  return payload.data.flatMap((rawModel) => {
    const model = asRecord(rawModel);
    if (!model || typeof model.id !== 'string' || !model.id) return [];
    const architecture = asRecord(model.architecture);
    return [{
      id: model.id,
      inputModalities: normalizeModalities(architecture?.input_modalities),
      name: typeof model.name === 'string' ? model.name : model.id,
      outputModalities: normalizeModalities(architecture?.output_modalities),
    }];
  });
}

export function normalizeOpenRouterOperationStatus(
  raw: unknown,
  providerOperationId: string,
): ProviderOperationStatus {
  const data = asRecord(asRecord(raw)?.data);
  if (!data) throw createInvalidProviderResponseError(providerOperationId);
  const promptTokens = readToken(data.tokens_prompt);
  const outputTokens = readToken(data.tokens_completion);
  const totalTokens = promptTokens !== null && outputTokens !== null ? promptTokens + outputTokens : null;
  return {
    error: null,
    modelId: typeof data.model === 'string' ? data.model : null,
    providerOperationId,
    state: 'succeeded',
    usage: normalizeOpenRouterProviderUsage({
      prompt_tokens: promptTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
      cost: data.total_cost,
    }),
  };
}
