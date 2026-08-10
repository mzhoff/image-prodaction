import type {
  CreateGenerationJobInput,
  GenerationFailureUsageInput,
  GenerationUsageInput,
} from '@/entities/generation/server/generation-orchestrator';
import type {
  ProviderAdapter,
  ProviderErrorDescriptor,
  ProviderUsage,
} from '@/modules/provider-connections';
import type { RecordUsageEventInput } from '@/modules/usage';

export interface ShortAiScope {
  documentId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown> | null;
  workspaceId: string;
}

export interface ProviderCallResult<T> {
  providerOperationId: string | null;
  result: T;
  usage: ProviderUsage;
}

export interface ShortAiExecutionDependencies {
  adapter: ProviderAdapter;
  createJob(input: CreateGenerationJobInput): Promise<{
    id: string;
    idempotentReplay: boolean;
    resultObjectKey?: string | null;
    status: string;
  }>;
  failJob(input: {
    attemptCount: number;
    errorCode: string;
    errorMessage: string;
    jobId: string;
    retryable: boolean;
    usage?: GenerationFailureUsageInput;
  }): Promise<unknown>;
  markProviderDispatched(input: { attemptCount: number; jobId: string }): Promise<void>;
  markProviderUsed(connectionId: string): Promise<void>;
  recordUsage(input: RecordUsageEventInput): Promise<unknown>;
  readResult(resultObjectKey: string): Promise<unknown>;
  resolveCredential(userId: string, workspaceId: string): Promise<{
    apiKey: string;
    connection: { id: string };
  }>;
  startJob(jobId: string): Promise<{ attemptCount: number }>;
  saveResult(input: {
    attemptCount: number;
    jobId: string;
    payload: unknown;
    providerOperationId: string | null;
    workspaceId: string;
  }): Promise<void>;
  succeedJob(input: {
    attemptCount: number;
    jobId: string;
    usage: GenerationUsageInput;
  }): Promise<unknown>;
  userId(request: Request): Promise<string>;
}

export class ShortAiExecutionError extends Error {
  readonly descriptor: ProviderErrorDescriptor;

  constructor(descriptor: ProviderErrorDescriptor) {
    super(descriptor.message);
    this.name = 'ShortAiExecutionError';
    this.descriptor = descriptor;
  }
}
