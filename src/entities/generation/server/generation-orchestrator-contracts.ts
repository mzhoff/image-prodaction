import type { GenerationJobRepository } from './generation-job-repository';

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
  assertAccess(input: { documentId: string | null; userId: string; workspaceId: string }): Promise<void>;
  createId(): string;
  now(): Date;
  repository: GenerationJobRepository;
}

export interface GenerationJobDto {
  attemptCount: number;
  cancelRequestedAt?: string | null;
  createdAt: string;
  documentId: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
  finalAssetId: string | null;
  finishedAt: string | null;
  id: string;
  idempotencyKey: string;
  idempotentReplay: boolean;
  enqueuedAt?: string | null;
  leaseExpiresAt: string | null;
  maxAttempts: number;
  metadata: Record<string, unknown> | null;
  modelId: string;
  operation: string;
  provider: string;
  providerOperationId?: string | null;
  queueJobId?: string | null;
  requestObjectKey?: string | null;
  resultObjectKey?: string | null;
  retryAvailableAt?: string | null;
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
  constructor() { super('Generation job not found.'); this.name = 'GenerationJobNotFoundError'; }
}

export class GenerationJobTransitionError extends Error {
  constructor(message = 'Generation job cannot transition from its current state.') {
    super(message); this.name = 'GenerationJobTransitionError';
  }
}

export class GenerationIdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key is already used for a different generation request.');
    this.name = 'GenerationIdempotencyConflictError';
  }
}

export class GenerationJobValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'GenerationJobValidationError'; }
}

export class GenerationDocumentWorkspaceMismatchError extends Error {
  constructor() {
    super('Document does not belong to the selected workspace.');
    this.name = 'GenerationDocumentWorkspaceMismatchError';
  }
}
