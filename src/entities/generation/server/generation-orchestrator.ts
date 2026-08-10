import { getDocument } from '@/entities/document/server/document-service';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { createUuidV7 } from '@/shared/lib/id';
import {
  createDbGenerationJobRepository,
  type GenerationJobRepository,
} from './generation-job-repository';
import { toGenerationJobDto } from './generation-job-dto';
import {
  getGenerationLeaseDurationMs,
  hasSameIdempotencyFingerprint,
  normalizeAttemptCount,
  normalizeFailureUsage,
  normalizeGenerationMetadata,
  normalizeLeaseDurationMs,
  normalizeMaxAttempts,
  normalizeRequiredText,
  normalizeRetryAvailableAt,
  normalizeSuccessUsage,
} from './generation-normalization';
import {
  GenerationDocumentWorkspaceMismatchError,
  GenerationIdempotencyConflictError,
  GenerationJobNotFoundError,
  GenerationJobTransitionError,
  type CreateGenerationJobInput,
  type GenerationFailureUsageInput,
  type GenerationJobDto,
  type GenerationOrchestratorDependencies,
  type GenerationUsageInput,
} from './generation-orchestrator-contracts';

export * from './generation-orchestrator-contracts';

export async function createGenerationJob(
  input: CreateGenerationJobInput,
  dependencies: GenerationOrchestratorDependencies = createDefaultDependencies(),
): Promise<GenerationJobDto> {
  const documentId = input.documentId ?? null;
  await dependencies.assertAccess({ documentId, userId: input.userId, workspaceId: input.workspaceId });
  const normalized = {
    documentId,
    provider: normalizeRequiredText(input.provider, 'Provider', 120),
    modelId: normalizeRequiredText(input.modelId, 'Model id', 255),
    operation: normalizeRequiredText(input.operation, 'Operation', 120),
    idempotencyKey: normalizeRequiredText(input.idempotencyKey, 'Idempotency key', 255),
    maxAttempts: normalizeMaxAttempts(input.maxAttempts),
    metadata: normalizeGenerationMetadata(input.metadata),
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
  })) throw new GenerationIdempotencyConflictError();
  return toGenerationJobDto(result.record, !result.created);
}

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
  if (!updated) throw await getTransitionError(jobId, dependencies.repository);
  return toGenerationJobDto(updated, false);
}

export async function claimNextGenerationJob(
  input: { leaseDurationMs?: number } = {},
  dependencies: GenerationOrchestratorDependencies = createDefaultDependencies(),
) {
  const claimedAt = dependencies.now();
  const claimed = await dependencies.repository.claimNext({
    claimedAt,
    leaseExpiresAt: new Date(claimedAt.getTime() + normalizeLeaseDurationMs(input.leaseDurationMs)),
  });
  return claimed ? toGenerationJobDto(claimed, false) : null;
}

export async function heartbeatGenerationJob(
  input: { attemptCount: number; jobId: string; leaseDurationMs?: number },
  dependencies: GenerationOrchestratorDependencies = createDefaultDependencies(),
) {
  const heartbeatAt = dependencies.now();
  const updated = await dependencies.repository.heartbeat({
    id: input.jobId,
    attemptCount: normalizeAttemptCount(input.attemptCount),
    heartbeatAt,
    leaseExpiresAt: new Date(heartbeatAt.getTime() + normalizeLeaseDurationMs(input.leaseDurationMs)),
  });
  return updated ? toGenerationJobDto(updated, false) : null;
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
  input: { assetId?: string | null; attemptCount: number; jobId: string; usage: GenerationUsageInput },
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
    retryAvailableAt?: Date | null;
    retryable: boolean;
    usage?: GenerationFailureUsageInput;
  },
  dependencies: GenerationOrchestratorDependencies = createDefaultDependencies(),
) {
  const finishedAt = dependencies.now();
  const updated = await dependencies.repository.fail({
    id: input.jobId,
    attemptCount: normalizeAttemptCount(input.attemptCount),
    errorCode: normalizeRequiredText(input.errorCode, 'Error code', 120),
    errorMessage: normalizeRequiredText(input.errorMessage, 'Error message', 1_000),
    retryAvailableAt: normalizeRetryAvailableAt(input.retryAvailableAt, finishedAt),
    retryable: input.retryable,
    finishedAt,
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

async function getTransitionError(jobId: string, repository: GenerationJobRepository) {
  return await repository.findById(jobId)
    ? new GenerationJobTransitionError()
    : new GenerationJobNotFoundError();
}
