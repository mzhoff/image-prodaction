import type {
  GenerationFailureUsageInput,
  GenerationJobDto,
  GenerationUsageInput,
} from '@/entities/generation/server/generation-orchestrator';
import type { GenerationRetryPolicy } from './retry-policy';

export interface GenerationExecutionResult {
  assetId?: string | null;
  usage: GenerationUsageInput;
}

export interface GenerationExecutor {
  execute(input: { job: GenerationJobDto; signal: AbortSignal }): Promise<GenerationExecutionResult>;
}

export interface GenerationWorkerQueue {
  claimNext(input: { leaseDurationMs: number }): Promise<GenerationJobDto | null>;
  fail(input: {
    attemptCount: number;
    errorCode: string;
    errorMessage: string;
    jobId: string;
    retryAvailableAt: Date | null;
    retryable: boolean;
    usage?: GenerationFailureUsageInput;
  }): Promise<boolean>;
  heartbeat(input: { attemptCount: number; jobId: string; leaseDurationMs: number }): Promise<boolean>;
  succeed(input: {
    assetId?: string | null;
    attemptCount: number;
    jobId: string;
    usage: GenerationUsageInput;
  }): Promise<boolean>;
}

export interface GenerationWorkerEvent {
  attemptCount?: number;
  errorCode?: string;
  jobId?: string;
  type: 'claimed' | 'completed' | 'failed' | 'lease-lost'
    | 'loop-error' | 'poll-ok' | 'started' | 'stopped';
}

export interface GenerationWorkerOptions {
  executor: GenerationExecutor;
  heartbeatIntervalMs?: number;
  leaseDurationMs?: number;
  now?: () => Date;
  onEvent?: (event: GenerationWorkerEvent) => void;
  pollIntervalMs?: number;
  queue?: GenerationWorkerQueue;
  retryPolicy?: GenerationRetryPolicy;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export class GenerationExecutionError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly usage?: GenerationFailureUsageInput;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    usage?: GenerationFailureUsageInput;
  }) {
    super(input.message);
    this.name = 'GenerationExecutionError';
    this.code = input.code;
    this.retryable = input.retryable;
    this.usage = input.usage;
  }
}
