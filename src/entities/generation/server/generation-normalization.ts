import type { GenerationJobRecord, GenerationUsageRecord } from './generation-job-repository';
import {
  GenerationJobValidationError,
  type GenerationFailureUsageInput,
  type GenerationUsageInput,
} from './generation-orchestrator-contracts';

export function normalizeSuccessUsage(input: GenerationUsageInput): {
  usage: GenerationUsageRecord;
  usageComplete: boolean;
} {
  const usage = normalizeUsage(input);
  return {
    usage,
    usageComplete: usage.inputTokens !== null
      && usage.outputTokens !== null
      && usage.totalTokens !== null,
  };
}

export function normalizeFailureUsage(input?: GenerationFailureUsageInput): GenerationUsageRecord {
  return normalizeUsage(input ?? {});
}

function normalizeUsage(input: GenerationFailureUsageInput): GenerationUsageRecord {
  return {
    inputTokens: normalizeNullableTokenCount(input.inputTokens, 'Input tokens'),
    outputTokens: normalizeNullableTokenCount(input.outputTokens, 'Output tokens'),
    totalTokens: normalizeNullableTokenCount(input.totalTokens, 'Total tokens'),
    providerCostUsd: normalizeDecimal(input.providerCostUsd, 'Provider cost'),
    internalCreditsCharged: normalizeDecimal(input.internalCreditsCharged, 'Internal credits charged'),
    internalCreditsBalanceAfter: normalizeDecimal(input.internalCreditsBalanceAfter, 'Internal credits balance'),
  };
}

export function normalizeRequiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  if (!normalized) throw new GenerationJobValidationError(`${label} is required.`);
  return normalized;
}

export function normalizeMaxAttempts(value?: number) {
  if (value === undefined) return 3;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new GenerationJobValidationError('Max attempts must be between 1 and 10.');
  }
  return value;
}

export function normalizeAttemptCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new GenerationJobValidationError('Attempt count must be a positive safe integer.');
  }
  return value;
}

export function normalizeLeaseDurationMs(value?: number) {
  if (value === undefined) return getGenerationLeaseDurationMs();
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 3_600_000) {
    throw new GenerationJobValidationError('Lease duration must be between 1 second and 1 hour.');
  }
  return value;
}

export function normalizeRetryAvailableAt(value: Date | null | undefined, finishedAt: Date) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value.getTime()) || value.getTime() < finishedAt.getTime()) {
    throw new GenerationJobValidationError('Retry availability must not be before failure time.');
  }
  return value;
}

export function getGenerationLeaseDurationMs() {
  const seconds = Number.parseInt(process.env.GENERATION_JOB_LEASE_SECONDS ?? '', 10);
  return (Number.isSafeInteger(seconds) && seconds >= 60 && seconds <= 3_600 ? seconds : 300) * 1_000;
}

export function normalizeGenerationMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > 32_768) throw new GenerationJobValidationError('Generation metadata is too large.');
  return JSON.parse(serialized) as Record<string, unknown>;
}

export function hasSameIdempotencyFingerprint(
  record: GenerationJobRecord,
  input: {
    createdByUserId: string;
    documentId: string | null;
    maxAttempts: number;
    metadata: Record<string, unknown> | null;
    modelId: string;
    operation: string;
    provider: string;
  },
) {
  return record.createdByUserId === input.createdByUserId
    && record.documentId === input.documentId
    && record.provider === input.provider
    && record.modelId === input.modelId
    && record.operation === input.operation
    && record.maxAttempts === input.maxAttempts
    && stableJson(record.metadata) === stableJson(input.metadata);
}

function normalizeNullableTokenCount(value: number | null | undefined, label: string) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GenerationJobValidationError(`${label} must be a non-negative safe integer.`);
  }
  return String(value);
}

function normalizeDecimal(value: string | null | undefined, label: string) {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(normalized)) {
    throw new GenerationJobValidationError(`${label} must be a non-negative decimal with at most 8 fractional digits.`);
  }
  return normalized;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
