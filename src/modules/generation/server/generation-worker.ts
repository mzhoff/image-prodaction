import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { createExponentialBackoffPolicy, type GenerationRetryPolicy } from './retry-policy';
import {
  type GenerationExecutor,
  type GenerationWorkerEvent,
  type GenerationWorkerOptions,
  type GenerationWorkerQueue,
} from './generation-worker-contracts';
import { createGenerationWorkerQueue } from './generation-worker-queue';
import {
  isAbortError,
  normalizeExecutionFailure,
  normalizePositiveInteger,
  waitFor,
} from './generation-worker-support';

export * from './generation-worker-contracts';
export { createGenerationWorkerQueue } from './generation-worker-queue';

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
    this.onEvent?.({ type: 'claimed', jobId: job.id, attemptCount: job.attemptCount });
    await this.process(job);
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
        this.onEvent?.({ type: 'loop-error', errorCode: 'worker_loop_error' });
        await this.waitForNextPoll();
      }
    }
  }

  private async process(job: GenerationJobDto) {
    const controller = new AbortController();
    const state = { executionFinished: false, leaseLost: false };
    const heartbeatLoop = this.runHeartbeatLoop(job, controller, state);
    try {
      const result = await this.executor.execute({ job, signal: controller.signal });
      if (state.leaseLost) return;
      const completed = await this.queue.succeed({
        jobId: job.id,
        attemptCount: job.attemptCount,
        assetId: result.assetId,
        usage: result.usage,
      });
      if (!completed) return this.emitLeaseLost(job);
      this.onEvent?.({ type: 'completed', jobId: job.id, attemptCount: job.attemptCount });
    } catch (error) {
      if (state.leaseLost) return;
      const failure = normalizeExecutionFailure(error);
      const retryable = failure.retryable && job.attemptCount < job.maxAttempts;
      const failed = await this.queue.fail({
        jobId: job.id,
        attemptCount: job.attemptCount,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryable,
        retryAvailableAt: retryable
          ? new Date(this.now().getTime() + this.retryPolicy.nextDelayMs(job.attemptCount))
          : null,
        usage: failure.usage,
      });
      if (!failed) return this.emitLeaseLost(job);
      this.onEvent?.({
        type: 'failed', jobId: job.id, attemptCount: job.attemptCount, errorCode: failure.code,
      });
    } finally {
      state.executionFinished = true;
      controller.abort();
      await heartbeatLoop;
    }
  }

  private async runHeartbeatLoop(
    job: GenerationJobDto,
    controller: AbortController,
    state: { executionFinished: boolean; leaseLost: boolean },
  ) {
    while (!state.executionFinished) {
      try {
        await this.wait(this.heartbeatIntervalMs, controller.signal);
      } catch (error) {
        if (isAbortError(error)) return;
        throw error;
      }
      if (state.executionFinished) return;
      try {
        const renewed = await this.queue.heartbeat({
          jobId: job.id,
          attemptCount: job.attemptCount,
          leaseDurationMs: this.leaseDurationMs,
        });
        if (renewed) continue;
      } catch {
        // A failed heartbeat means this process can no longer safely commit.
      }
      state.leaseLost = true;
      controller.abort(new Error('Generation job lease was lost.'));
      this.emitLeaseLost(job);
      return;
    }
  }

  private emitLeaseLost(job: GenerationJobDto) {
    this.onEvent?.({ type: 'lease-lost', jobId: job.id, attemptCount: job.attemptCount });
  }

  private async waitForNextPoll() {
    try {
      await this.wait(this.pollIntervalMs, this.stopController.signal);
    } catch (error) {
      if (!isAbortError(error)) throw error;
    }
  }
}
