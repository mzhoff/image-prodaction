import {
  GenerationJobTransitionError,
  claimNextGenerationJob,
  failGenerationJob,
  heartbeatGenerationJob,
  succeedGenerationJob,
  type GenerationFailureUsageInput,
  type GenerationJobDto,
  type GenerationUsageInput,
} from '@/entities/generation/server/generation-orchestrator';
import {
  createExponentialBackoffPolicy,
  type GenerationRetryPolicy,
} from './retry-policy';

export interface GenerationExecutionResult {
  assetId?: string | null;
  usage: GenerationUsageInput;
}

export interface GenerationExecutor {
  execute(input: {
    job: GenerationJobDto;
    signal: AbortSignal;
  }): Promise<GenerationExecutionResult>;
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
  heartbeat(input: {
    attemptCount: number;
    jobId: string;
    leaseDurationMs: number;
  }): Promise<boolean>;
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
  type:
    | 'claimed'
    | 'completed'
    | 'failed'
    | 'lease-lost'
    | 'loop-error'
    | 'poll-ok'
    | 'started'
    | 'stopped';
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

const DEFAULT_LEASE_DURATION_MS = 60_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

export class GenerationWorker {
  private readonly executor: GenerationExecutor;
  private readonly heartbeatIntervalMs: number;
  private readonly leaseDurationMs: number;
  private readonly now: () => Date;
  private readonly onEvent?: (event: GenerationWorkerEvent) => void;
  private readonly pollIntervalMs: number;
  private readonly queue: GenerationWorkerQueue;
  private readonly retryPolicy: GenerationRetryPolicy;
  private readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  private loopPromise: Promise<void> | null = null;
  private stopController = new AbortController();
  private stopping = false;

  constructor(options: GenerationWorkerOptions) {
    this.executor = options.executor;
    this.leaseDurationMs = normalizePositiveInteger(
      options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS,
      'Lease duration',
    );
    this.heartbeatIntervalMs = normalizePositiveInteger(
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      'Heartbeat interval',
    );
    if (this.heartbeatIntervalMs >= this.leaseDurationMs) {
      throw new Error('Heartbeat interval must be shorter than lease duration.');
    }
    this.pollIntervalMs = normalizePositiveInteger(
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      'Poll interval',
    );
    this.now = options.now ?? (() => new Date());
    this.onEvent = options.onEvent;
    this.queue = options.queue ?? createGenerationWorkerQueue();
    this.retryPolicy = options.retryPolicy ?? createExponentialBackoffPolicy();
    this.wait = options.wait ?? waitFor;
  }

  start() {
    if (this.loopPromise) return this.loopPromise;
    this.stopping = false;
    this.stopController = new AbortController();
    this.onEvent?.({ type: 'started' });
    this.loopPromise = this.runLoop().finally(() => {
      this.loopPromise = null;
      this.onEvent?.({ type: 'stopped' });
    });
    return this.loopPromise;
  }

  async stop() {
    this.stopping = true;
    this.stopController.abort();
    await this.loopPromise;
  }

  async runOnce() {
    const job = await this.queue.claimNext({ leaseDurationMs: this.leaseDurationMs });
    if (!job) return false;
    this.onEvent?.({
      type: 'claimed',
      jobId: job.id,
      attemptCount: job.attemptCount,
    });
    await this.process(job);
    return true;
  }

  private async runLoop() {
    while (!this.stopping) {
      try {
        const claimed = await this.runOnce();
        this.onEvent?.({ type: 'poll-ok' });
        if (!claimed) {
          await this.waitForNextPoll();
        }
      } catch {
        if (this.stopping) return;
        this.onEvent?.({ type: 'loop-error', errorCode: 'worker_loop_error' });
        await this.waitForNextPoll();
      }
    }
  }

  private async process(job: GenerationJobDto) {
    const executionController = new AbortController();
    let executionFinished = false;
    let leaseLost = false;
    const heartbeatLoop = (async () => {
      while (!executionFinished) {
        try {
          await this.wait(this.heartbeatIntervalMs, executionController.signal);
        } catch (error) {
          if (isAbortError(error)) return;
          throw error;
        }
        if (executionFinished) return;
        try {
          const renewed = await this.queue.heartbeat({
            jobId: job.id,
            attemptCount: job.attemptCount,
            leaseDurationMs: this.leaseDurationMs,
          });
          if (renewed) continue;
        } catch {
          // A failed heartbeat is treated as lost ownership. Another worker may
          // already have reclaimed this attempt, so this worker must not commit.
        }
        leaseLost = true;
        executionController.abort(new Error('Generation job lease was lost.'));
        this.onEvent?.({
          type: 'lease-lost',
          jobId: job.id,
          attemptCount: job.attemptCount,
        });
        return;
      }
    })();

    try {
      const result = await this.executor.execute({
        job,
        signal: executionController.signal,
      });
      if (leaseLost) return;
      const completed = await this.queue.succeed({
        jobId: job.id,
        attemptCount: job.attemptCount,
        assetId: result.assetId,
        usage: result.usage,
      });
      if (!completed) {
        this.onEvent?.({
          type: 'lease-lost',
          jobId: job.id,
          attemptCount: job.attemptCount,
        });
        return;
      }
      this.onEvent?.({
        type: 'completed',
        jobId: job.id,
        attemptCount: job.attemptCount,
      });
    } catch (error) {
      if (leaseLost) return;
      const failure = normalizeExecutionFailure(error);
      const retryable = failure.retryable && job.attemptCount < job.maxAttempts;
      const retryAvailableAt = retryable
        ? new Date(this.now().getTime() + this.retryPolicy.nextDelayMs(job.attemptCount))
        : null;
      const failed = await this.queue.fail({
        jobId: job.id,
        attemptCount: job.attemptCount,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryable,
        retryAvailableAt,
        usage: failure.usage,
      });
      if (!failed) {
        this.onEvent?.({
          type: 'lease-lost',
          jobId: job.id,
          attemptCount: job.attemptCount,
        });
        return;
      }
      this.onEvent?.({
        type: 'failed',
        jobId: job.id,
        attemptCount: job.attemptCount,
        errorCode: failure.code,
      });
    } finally {
      executionFinished = true;
      executionController.abort();
      await heartbeatLoop;
    }
  }

  private async waitForNextPoll() {
    try {
      await this.wait(this.pollIntervalMs, this.stopController.signal);
    } catch (error) {
      if (!isAbortError(error)) throw error;
    }
  }
}

export function createGenerationWorkerQueue(): GenerationWorkerQueue {
  return {
    claimNext: (input) => claimNextGenerationJob(input),
    async fail(input) {
      try {
        await failGenerationJob(input);
        return true;
      } catch (error) {
        if (error instanceof GenerationJobTransitionError) return false;
        throw error;
      }
    },
    async heartbeat(input) {
      return Boolean(await heartbeatGenerationJob(input));
    },
    async succeed(input) {
      try {
        await succeedGenerationJob(input);
        return true;
      } catch (error) {
        if (error instanceof GenerationJobTransitionError) return false;
        throw error;
      }
    },
  };
}

function normalizeExecutionFailure(error: unknown) {
  if (error instanceof GenerationExecutionError) {
    return {
      code: normalizeErrorCode(error.code),
      message: normalizeErrorMessage(error.message),
      retryable: error.retryable,
      usage: error.usage,
    };
  }
  return {
    code: 'worker_execution_error',
    message: normalizeErrorMessage(error instanceof Error ? error.message : 'Generation execution failed.'),
    retryable: true,
    usage: undefined,
  };
}

function normalizeErrorCode(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 120);
  return normalized || 'worker_execution_error';
}

function normalizeErrorMessage(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 1_000) || 'Generation execution failed.';
}

function normalizePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function waitFor(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      reject(createAbortError());
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function createAbortError() {
  const error = new Error('Operation aborted.');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}
