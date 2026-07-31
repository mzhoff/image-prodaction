import type {
  PipelineRunExecutor,
  PipelineRunJob,
  PipelineRunQueue,
} from '../contracts/pipeline-contracts';
import {
  createPipelineRetryPolicy,
  type PipelineRetryPolicy,
} from './pipeline-retry-policy';
import {
  isPipelineWorkerAbortError,
  normalizePipelineExecutionFailure,
  normalizePipelineWorkerPositiveInteger,
  waitForPipelineWorker,
} from './pipeline-worker-support';

export interface PipelineWorkerEvent {
  attemptCount?: number;
  errorCode?: string;
  runId?: string;
  type:
    | 'canceled'
    | 'claimed'
    | 'completed'
    | 'failed'
    | 'lease-lost'
    | 'loop-error'
    | 'poll-ok'
    | 'started'
    | 'stopped';
}

export interface PipelineWorkerOptions {
  executor: PipelineRunExecutor;
  heartbeatIntervalMs?: number;
  leaseDurationMs?: number;
  now?: () => Date;
  onEvent?: (event: PipelineWorkerEvent) => void;
  pollIntervalMs?: number;
  queue: PipelineRunQueue;
  retryPolicy?: PipelineRetryPolicy;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

const DEFAULT_LEASE_DURATION_MS = 60_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

export class PipelineWorker {
  private readonly executor: PipelineRunExecutor;
  private readonly heartbeatIntervalMs: number;
  private readonly leaseDurationMs: number;
  private readonly now: () => Date;
  private readonly onEvent?: (event: PipelineWorkerEvent) => void;
  private readonly pollIntervalMs: number;
  private readonly queue: PipelineRunQueue;
  private readonly retryPolicy: PipelineRetryPolicy;
  private readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  private loopPromise: Promise<void> | null = null;
  private stopController = new AbortController();
  private stopping = false;

  constructor(options: PipelineWorkerOptions) {
    this.executor = options.executor;
    this.leaseDurationMs = normalizePipelineWorkerPositiveInteger(
      options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS,
      'Lease duration',
    );
    this.heartbeatIntervalMs = normalizePipelineWorkerPositiveInteger(
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      'Heartbeat interval',
    );
    if (this.heartbeatIntervalMs >= this.leaseDurationMs) {
      throw new Error('Heartbeat interval must be shorter than lease duration.');
    }
    this.pollIntervalMs = normalizePipelineWorkerPositiveInteger(
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      'Poll interval',
    );
    this.now = options.now ?? (() => new Date());
    this.onEvent = options.onEvent;
    this.queue = options.queue;
    this.retryPolicy = options.retryPolicy ?? createPipelineRetryPolicy();
    this.wait = options.wait ?? waitForPipelineWorker;
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
    const claimedAt = this.now();
    const run = await this.queue.claimNext({
      claimedAt,
      leaseExpiresAt: new Date(claimedAt.getTime() + this.leaseDurationMs),
    });
    if (!run) return false;
    this.onEvent?.({
      type: 'claimed',
      runId: run.id,
      attemptCount: run.attemptCount,
    });
    await this.process(run);
    return true;
  }

  private async runLoop() {
    while (!this.stopping) {
      try {
        const claimed = await this.runOnce();
        this.onEvent?.({ type: 'poll-ok' });
        if (!claimed) await this.waitForNextPoll();
      } catch {
        if (this.stopping) return;
        this.onEvent?.({ type: 'loop-error', errorCode: 'pipeline_worker_loop_error' });
        await this.waitForNextPoll();
      }
    }
  }

  private async process(run: PipelineRunJob) {
    const executionController = new AbortController();
    let executionFinished = false;
    const leaseState: { value: 'active' | 'canceled' | 'lost' } = {
      value: 'active',
    };
    const heartbeatLoop = this.runHeartbeatLoop(run, executionController, (state) => {
      leaseState.value = state;
    }, () => executionFinished);

    try {
      const result = await this.executor.execute({
        run,
        signal: executionController.signal,
      });
      if (leaseState.value === 'lost') return;
      if (leaseState.value === 'canceled') {
        await this.commitCancellation(run);
        return;
      }
      const completedAt = this.now();
      const completed = await this.queue.succeed({
        runId: run.id,
        attemptCount: run.attemptCount,
        completedAt,
        result,
      });
      this.onEvent?.(completed
        ? { type: 'completed', runId: run.id, attemptCount: run.attemptCount }
        : { type: 'lease-lost', runId: run.id, attemptCount: run.attemptCount });
    } catch (error) {
      if (leaseState.value === 'lost') return;
      if (leaseState.value === 'canceled') {
        await this.commitCancellation(run);
        return;
      }
      await this.commitFailure(run, error);
    } finally {
      executionFinished = true;
      executionController.abort();
      await heartbeatLoop;
    }
  }

  private async runHeartbeatLoop(
    run: PipelineRunJob,
    controller: AbortController,
    setLeaseState: (state: 'active' | 'canceled' | 'lost') => void,
    isFinished: () => boolean,
  ) {
    while (!isFinished()) {
      try {
        await this.wait(this.heartbeatIntervalMs, controller.signal);
      } catch (error) {
        if (isPipelineWorkerAbortError(error)) return;
        throw error;
      }
      if (isFinished()) return;

      const heartbeatAt = this.now();
      let heartbeat: 'canceled' | 'lost' | 'renewed';
      try {
        heartbeat = await this.queue.heartbeat({
          runId: run.id,
          attemptCount: run.attemptCount,
          heartbeatAt,
          leaseExpiresAt: new Date(heartbeatAt.getTime() + this.leaseDurationMs),
        });
      } catch {
        heartbeat = 'lost';
      }
      if (heartbeat === 'renewed') continue;

      setLeaseState(heartbeat);
      controller.abort(new Error(`Pipeline run lease ${heartbeat}.`));
      this.onEvent?.({
        type: heartbeat === 'canceled' ? 'canceled' : 'lease-lost',
        runId: run.id,
        attemptCount: run.attemptCount,
      });
      return;
    }
  }

  private async commitCancellation(run: PipelineRunJob) {
    const canceled = await this.queue.cancel({
      runId: run.id,
      attemptCount: run.attemptCount,
      canceledAt: this.now(),
    });
    if (!canceled) {
      this.onEvent?.({
        type: 'lease-lost',
        runId: run.id,
        attemptCount: run.attemptCount,
      });
    }
  }

  private async commitFailure(run: PipelineRunJob, error: unknown) {
    const failure = normalizePipelineExecutionFailure(error);
    const retryable = failure.retryable && run.attemptCount < run.maxAttempts;
    const failedAt = this.now();
    const retryAvailableAt = retryable
      ? new Date(failedAt.getTime() + this.retryPolicy.nextDelayMs(run.attemptCount))
      : null;
    const failed = await this.queue.fail({
      runId: run.id,
      attemptCount: run.attemptCount,
      errorCode: failure.code,
      errorMessage: failure.message,
      failedAt,
      retryable,
      retryAvailableAt,
    });
    this.onEvent?.(failed
      ? {
        type: 'failed',
        runId: run.id,
        attemptCount: run.attemptCount,
        errorCode: failure.code,
      }
      : { type: 'lease-lost', runId: run.id, attemptCount: run.attemptCount });
  }

  private async waitForNextPoll() {
    try {
      await this.wait(this.pollIntervalMs, this.stopController.signal);
    } catch (error) {
      if (!isPipelineWorkerAbortError(error)) throw error;
    }
  }
}
