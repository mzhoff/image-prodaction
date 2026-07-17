import { getDocument } from '@/entities/document/server/document-service';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { createUuidV7 } from '@/shared/lib/id';
import {
  createDbGenerationJobRepository,
  type GenerationJobRecord,
  type GenerationJobRepository,
  type GenerationUsageRecord,
} from './generation-job-repository';

export interface CreateGenerationJobInput {
  documentId?: string | null;
  idempotencyKey: string;
  maxAttempts?: number;
  metadata?: Record<string, unknown> | null;
  modelId: string;
  operation: string;
  provider: string;
  userId: string;
  workspaceId: string;
}

export interface GenerationUsageInput {
  inputTokens: number | null;
  internalCreditsBalanceAfter?: string | null;
  internalCreditsCharged?: string | null;
  outputTokens: number | null;
  providerCostUsd?: string | null;
  totalTokens: number | null;
}

export interface GenerationFailureUsageInput {
  inputTokens?: number | null;
  internalCreditsBalanceAfter?: string | null;
  internalCreditsCharged?: string | null;
  outputTokens?: number | null;
  providerCostUsd?: string | null;
  totalTokens?: number | null;
}

export interface GenerationOrchestratorDependencies {
  assertAccess(input: {
    documentId: string | null;
    userId: string;
    workspaceId: string;
  }): Promise<void>;
  createId(): string;
  now(): Date;
  repository: GenerationJobRepository;
}

export interface GenerationJobDto {
  attemptCount: number;
  createdAt: string;
  documentId: string | null;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  finalAssetId: string | null;
  finishedAt: string | null;
  id: string;
  idempotencyKey: string;
  idempotentReplay: boolean;
  leaseExpiresAt: string | null;
  maxAttempts: number;
  metadata: Record<string, unknown> | null;
  modelId: string;
  operation: string;
  provider: string;
  startedAt: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  updatedAt: string;
  usage: {
    complete: boolean;
    inputTokens: string | null;
    internalCreditsBalanceAfter: string | null;
    internalCreditsCharged: string | null;
    outputTokens: string | null;
    providerCostUsd: string | null;
    totalTokens: string | null;
  };
  workspaceId: string;
}

export class GenerationJobNotFoundError extends Error {
  constructor() {
    super('Generation job not found.');
    this.name = 'GenerationJobNotFoundError';
  }
}

export class GenerationJobTransitionError extends Error {
  constructor(message = 'Generation job cannot transition from its current state.') {
    super(message);
    this.name = 'GenerationJobTransitionError';
  }
}

export class GenerationIdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key is already used for a different generation request.');
    this.name = 'GenerationIdempotencyConflictError';
  }
}

export class GenerationJobValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationJobValidationError';
  }
}

export class GenerationDocumentWorkspaceMismatchError extends Error {
  constructor() {
    super('Document does not belong to the selected workspace.');
    this.name = 'GenerationDocumentWorkspaceMismatchError';
  }
}

export async function createGenerationJob(
  input: CreateGenerationJobInput,
  dependencies: GenerationOrchestratorDependencies = createDefaultDependencies(),
): Promise<GenerationJobDto> {
  const documentId = input.documentId ?? null;
  await dependencies.assertAccess({
    documentId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const normalized = {
    documentId,
    provider: normalizeRequiredText(input.provider, 'Provider', 120),
    modelId: normalizeRequiredText(input.modelId, 'Model id', 255),
    operation: normalizeRequiredText(input.operation, 'Operation', 120),
    idempotencyKey: normalizeRequiredText(input.idempotencyKey, 'Idempotency key', 255),
    maxAttempts: normalizeMaxAttempts(input.maxAttempts),
    metadata: normalizeMetadata(input.metadata),
  };
  const result = await dependencies.repository.createOrFind({
    id: dependencies.createId(),
    workspaceId: input.workspaceId,
    createdByUserId: input.userId,
    ...normalized,
  });
  if (!result.created && !hasSameIdempotencyFingerprint(result.record, {
    ...normalized,
    createdByUserId: input.userId,
  })) {
    throw new GenerationIdempotencyConflictError();
  }
  return toGenerationJobDto(result.record, !result.created);
}

/**
 * Starts either the initial attempt or a retry previously marked retryable.
 * A failed non-retryable job and a job that exhausted maxAttempts stay closed.
 */
export async function startGenerationJob(
  jobId: string,
  dependencies: GenerationOrchestratorDependencies = createDefaultDependencies(),
) {
  const startedAt = dependencies.now();
  const updated = await dependencies.repository.start(
    jobId,
    startedAt,
    new Date(startedAt.getTime() + getGenerationLeaseDurationMs()),
  );
  if (!updated) {
    const current = await dependencies.repository.findById(jobId);
    if (!current) throw new GenerationJobNotFoundError();
    throw new GenerationJobTransitionError();
  }
  return toGenerationJobDto(updated, false);
}

export async function recoverExpiredGenerationJob(
  jobId: string,
  dependencies: GenerationOrchestratorDependencies = createDefaultDependencies(),
) {
  const updated = await dependencies.repository.expireLease(jobId, dependencies.now());
  if (!updated) throw await getTransitionError(jobId, dependencies.repository);
  return toGenerationJobDto(updated, false);
}

export async function succeedGenerationJob(
  input: {
    assetId?: string | null;
    attemptCount: number;
    jobId: string;
    usage: GenerationUsageInput;
  },
  dependencies: GenerationOrchestratorDependencies = createDefaultDependencies(),
) {
  const updated = await dependencies.repository.succeed({
    id: input.jobId,
    attemptCount: normalizeAttemptCount(input.attemptCount),
    finalAssetId: input.assetId ?? null,
    finishedAt: dependencies.now(),
    ...normalizeSuccessUsage(input.usage),
  });
  if (!updated) throw await getTransitionError(input.jobId, dependencies.repository);
  return toGenerationJobDto(updated, false);
}

export async function failGenerationJob(
  input: {
    attemptCount: number;
    errorCode: string;
    errorMessage: string;
    jobId: string;
    retryable: boolean;
    usage?: GenerationFailureUsageInput;
  },
  dependencies: GenerationOrchestratorDependencies = createDefaultDependencies(),
) {
  const updated = await dependencies.repository.fail({
    id: input.jobId,
    attemptCount: normalizeAttemptCount(input.attemptCount),
    errorCode: normalizeRequiredText(input.errorCode, 'Error code', 120),
    errorMessage: normalizeRequiredText(input.errorMessage, 'Error message', 1_000),
    retryable: input.retryable,
    finishedAt: dependencies.now(),
    usage: normalizeFailureUsage(input.usage),
  });
  if (!updated) throw await getTransitionError(input.jobId, dependencies.repository);
  return toGenerationJobDto(updated, false);
}

export async function getGenerationJob(
  userId: string,
  jobId: string,
  repository: GenerationJobRepository = createDbGenerationJobRepository(),
) {
  const record = await repository.findAccessible(jobId, userId);
  if (!record) throw new GenerationJobNotFoundError();
  return toGenerationJobDto(record, false);
}

async function assertGenerationAccess(input: {
  documentId: string | null;
  userId: string;
  workspaceId: string;
}) {
  await requireWorkspaceMembership(input.userId, input.workspaceId);
  if (!input.documentId) return;
  const targetDocument = await getDocument(input.userId, input.documentId);
  if (targetDocument.workspaceId !== input.workspaceId) {
    throw new GenerationDocumentWorkspaceMismatchError();
  }
}

function createDefaultDependencies(): GenerationOrchestratorDependencies {
  return {
    assertAccess: assertGenerationAccess,
    createId: createUuidV7,
    now: () => new Date(),
    repository: createDbGenerationJobRepository(),
  };
}

function toGenerationJobDto(record: GenerationJobRecord, idempotentReplay: boolean): GenerationJobDto {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    provider: record.provider,
    modelId: record.modelId,
    operation: record.operation,
    idempotencyKey: record.idempotencyKey,
    idempotentReplay,
    status: record.status,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    finalAssetId: record.finalAssetId,
    leaseExpiresAt: record.leaseExpiresAt?.toISOString() ?? null,
    usage: {
      complete: record.usageComplete,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      providerCostUsd: record.providerCostUsd,
      internalCreditsCharged: record.internalCreditsCharged,
      internalCreditsBalanceAfter: record.internalCreditsBalanceAfter,
    },
    error: record.errorCode && record.errorMessage
      ? {
        code: record.errorCode,
        message: record.errorMessage,
        retryable: record.retryable ?? false,
      }
      : null,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function normalizeSuccessUsage(input: GenerationUsageInput): {
  usage: GenerationUsageRecord;
  usageComplete: boolean;
} {
  const usage = {
    inputTokens: normalizeNullableTokenCount(input.inputTokens, 'Input tokens'),
    outputTokens: normalizeNullableTokenCount(input.outputTokens, 'Output tokens'),
    totalTokens: normalizeNullableTokenCount(input.totalTokens, 'Total tokens'),
    providerCostUsd: normalizeDecimal(input.providerCostUsd, 'Provider cost'),
    internalCreditsCharged: normalizeDecimal(input.internalCreditsCharged, 'Internal credits charged'),
    internalCreditsBalanceAfter: normalizeDecimal(
      input.internalCreditsBalanceAfter,
      'Internal credits balance',
    ),
  };
  return {
    usage,
    usageComplete: usage.inputTokens !== null
      && usage.outputTokens !== null
      && usage.totalTokens !== null,
  };
}

function normalizeFailureUsage(input?: GenerationFailureUsageInput): GenerationUsageRecord {
  return {
    inputTokens: normalizeNullableTokenCount(input?.inputTokens, 'Input tokens'),
    outputTokens: normalizeNullableTokenCount(input?.outputTokens, 'Output tokens'),
    totalTokens: normalizeNullableTokenCount(input?.totalTokens, 'Total tokens'),
    providerCostUsd: normalizeDecimal(input?.providerCostUsd, 'Provider cost'),
    internalCreditsCharged: normalizeDecimal(input?.internalCreditsCharged, 'Internal credits charged'),
    internalCreditsBalanceAfter: normalizeDecimal(
      input?.internalCreditsBalanceAfter,
      'Internal credits balance',
    ),
  };
}

function normalizeTokenCount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GenerationJobValidationError(`${label} must be a non-negative safe integer.`);
  }
  return String(value);
}

function normalizeNullableTokenCount(value: number | null | undefined, label: string) {
  return value === null || value === undefined ? null : normalizeTokenCount(value, label);
}

function normalizeDecimal(value: string | null | undefined, label: string) {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(normalized)) {
    throw new GenerationJobValidationError(
      `${label} must be a non-negative decimal with at most 8 fractional digits.`,
    );
  }
  return normalized;
}

function normalizeRequiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  if (!normalized) throw new GenerationJobValidationError(`${label} is required.`);
  return normalized;
}

function normalizeMaxAttempts(value?: number) {
  if (value === undefined) return 3;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new GenerationJobValidationError('Max attempts must be between 1 and 10.');
  }
  return value;
}

function normalizeAttemptCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new GenerationJobValidationError('Attempt count must be a positive safe integer.');
  }
  return value;
}

function getGenerationLeaseDurationMs() {
  const seconds = Number.parseInt(process.env.GENERATION_JOB_LEASE_SECONDS ?? '', 10);
  const normalized = Number.isSafeInteger(seconds) && seconds >= 60 && seconds <= 3_600
    ? seconds
    : 5 * 60;
  return normalized * 1_000;
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > 32_768) {
    throw new GenerationJobValidationError('Generation metadata is too large.');
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

function hasSameIdempotencyFingerprint(
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

async function getTransitionError(jobId: string, repository: GenerationJobRepository) {
  return await repository.findById(jobId)
    ? new GenerationJobTransitionError()
    : new GenerationJobNotFoundError();
}
