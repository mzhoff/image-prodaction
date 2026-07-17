import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  GenerationFailureUsageInput,
  GenerationJobDto,
  GenerationUsageInput,
} from '@/entities/generation/server/generation-orchestrator';
import {
  GenerationExecutionError,
  GenerationWorker,
  type GenerationWorkerQueue,
} from './generation-worker';

const jobId = '01900000-0000-7000-8000-000000000010';
const queuedAt = new Date('2026-07-17T10:00:00.000Z');
const emptyUsage = {
  complete: false,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  providerCostUsd: null,
  internalCreditsCharged: null,
  internalCreditsBalanceAfter: null,
};

test('worker restart respects persisted retry backoff and completes the next fenced attempt', async () => {
  let now = new Date(queuedAt);
  const queue = new MemoryWorkerQueue(createQueuedJob(), () => now);
  const firstWorker = new GenerationWorker({
    queue,
    now: () => now,
    heartbeatIntervalMs: 20_000,
    leaseDurationMs: 60_000,
    retryPolicy: { nextDelayMs: () => 1_000 },
    executor: {
      async execute() {
        throw new GenerationExecutionError({
          code: 'provider_timeout',
          message: 'Provider timed out.',
          retryable: true,
          usage: {
            inputTokens: 10,
            totalTokens: 10,
            providerCostUsd: '0.001',
          },
        });
      },
    },
  });

  assert.equal(await firstWorker.runOnce(), true);
  assert.equal(queue.job.status, 'failed');
  assert.equal(queue.job.attemptCount, 1);
  assert.equal(queue.job.retryAvailableAt, new Date(now.getTime() + 1_000).toISOString());

  const restartedWorker = new GenerationWorker({
    queue,
    now: () => now,
    heartbeatIntervalMs: 20_000,
    leaseDurationMs: 60_000,
    executor: {
      async execute() {
        return {
          assetId: '01900000-0000-7000-8000-000000000020',
          usage: {
            inputTokens: 20,
            outputTokens: 5,
            totalTokens: 25,
          },
        };
      },
    },
  });
  assert.equal(await restartedWorker.runOnce(), false);
  now = new Date(now.getTime() + 1_000);
  assert.equal(await restartedWorker.runOnce(), true);
  assert.equal(queue.job.status, 'succeeded');
  assert.equal(queue.job.attemptCount, 2);
});

test('expired lease is reclaimed once and duplicate delivery cannot commit a stale attempt', async () => {
  const now = new Date('2026-07-17T10:02:00.000Z');
  const expired = {
    ...createQueuedJob(),
    status: 'running' as const,
    attemptCount: 1,
    leaseExpiresAt: new Date('2026-07-17T10:01:00.000Z').toISOString(),
    startedAt: queuedAt.toISOString(),
  };
  const queue = new MemoryWorkerQueue(expired, () => now);
  let executions = 0;
  const createWorker = () => new GenerationWorker({
    queue,
    heartbeatIntervalMs: 20_000,
    leaseDurationMs: 60_000,
    executor: {
      async execute() {
        executions += 1;
        return {
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalTokens: 2,
          },
        };
      },
    },
  });

  const [firstClaimed, secondClaimed] = await Promise.all([
    createWorker().runOnce(),
    createWorker().runOnce(),
  ]);
  assert.deepEqual([firstClaimed, secondClaimed].sort(), [false, true]);
  assert.equal(executions, 1);
  assert.equal(queue.job.status, 'succeeded');
  assert.equal(queue.job.attemptCount, 2);
  assert.equal(await queue.succeed({
    jobId,
    attemptCount: 1,
    usage: {
      inputTokens: 99,
      outputTokens: 99,
      totalTokens: 198,
    },
  }), false);
});

test('worker heartbeats a long-running execution before completing it', async () => {
  const queue = new MemoryWorkerQueue(createQueuedJob(), () => new Date());
  const worker = new GenerationWorker({
    queue,
    heartbeatIntervalMs: 2,
    leaseDurationMs: 50,
    executor: {
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 12));
        return {
          usage: {
            inputTokens: 2,
            outputTokens: 3,
            totalTokens: 5,
          },
        };
      },
    },
  });
  assert.equal(await worker.runOnce(), true);
  assert.equal(queue.job.status, 'succeeded');
  assert.ok(queue.heartbeatCalls >= 1);
});

test('graceful shutdown stops claiming and waits for the in-flight executor', async () => {
  const queue = new MemoryWorkerQueue(createQueuedJob(), () => new Date());
  const started = deferred<void>();
  const release = deferred<void>();
  const worker = new GenerationWorker({
    queue,
    heartbeatIntervalMs: 100,
    leaseDurationMs: 1_000,
    pollIntervalMs: 10,
    executor: {
      async execute() {
        started.resolve();
        await release.promise;
        return {
          usage: {
            inputTokens: 1,
            outputTokens: 0,
            totalTokens: 1,
          },
        };
      },
    },
  });

  void worker.start();
  await started.promise;
  let stopped = false;
  const stopPromise = worker.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);
  assert.equal(queue.claimCalls, 1);

  release.resolve();
  await stopPromise;
  assert.equal(stopped, true);
  assert.equal(queue.claimCalls, 1);
  assert.equal(queue.job.status, 'succeeded');
});

class MemoryWorkerQueue implements GenerationWorkerQueue {
  claimCalls = 0;
  heartbeatCalls = 0;
  job: GenerationJobDto;
  private readonly now: () => Date;

  constructor(
    job: GenerationJobDto,
    now: () => Date,
  ) {
    this.job = job;
    this.now = now;
  }

  async claimNext(input: { leaseDurationMs: number }) {
    this.claimCalls += 1;
    const now = this.now();
    const retryAvailableAt = this.job.retryAvailableAt
      ? new Date(this.job.retryAvailableAt)
      : null;
    const leaseExpiresAt = this.job.leaseExpiresAt
      ? new Date(this.job.leaseExpiresAt)
      : null;
    const claimable = this.job.attemptCount < this.job.maxAttempts && (
      this.job.status === 'queued'
      || (
        this.job.status === 'failed'
        && this.job.error?.retryable
        && (!retryAvailableAt || retryAvailableAt <= now)
      )
      || (
        this.job.status === 'running'
        && (!leaseExpiresAt || leaseExpiresAt <= now)
      )
    );
    if (!claimable || this.job.cancelRequestedAt) return null;
    this.job = {
      ...this.job,
      status: 'running',
      attemptCount: this.job.attemptCount + 1,
      error: null,
      finishedAt: null,
      leaseExpiresAt: new Date(now.getTime() + input.leaseDurationMs).toISOString(),
      retryAvailableAt: null,
      startedAt: this.job.startedAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
    return this.job;
  }

  async fail(input: {
    attemptCount: number;
    errorCode: string;
    errorMessage: string;
    jobId: string;
    retryAvailableAt: Date | null;
    retryable: boolean;
    usage?: GenerationFailureUsageInput;
  }) {
    if (!this.owns(input.jobId, input.attemptCount)) return false;
    const now = this.now();
    this.job = {
      ...this.job,
      status: 'failed',
      error: {
        code: input.errorCode,
        message: input.errorMessage,
        retryable: input.retryable,
      },
      finishedAt: now.toISOString(),
      leaseExpiresAt: null,
      retryAvailableAt: input.retryAvailableAt?.toISOString() ?? null,
      updatedAt: now.toISOString(),
      usage: mergeUsage(this.job.usage, input.usage),
    };
    return true;
  }

  async heartbeat(input: {
    attemptCount: number;
    jobId: string;
    leaseDurationMs: number;
  }) {
    this.heartbeatCalls += 1;
    if (!this.owns(input.jobId, input.attemptCount)) return false;
    const now = this.now();
    const leaseExpiresAt = this.job.leaseExpiresAt
      ? new Date(this.job.leaseExpiresAt)
      : null;
    if (!leaseExpiresAt || leaseExpiresAt <= now || this.job.cancelRequestedAt) return false;
    this.job = {
      ...this.job,
      leaseExpiresAt: new Date(now.getTime() + input.leaseDurationMs).toISOString(),
      updatedAt: now.toISOString(),
    };
    return true;
  }

  async succeed(input: {
    assetId?: string | null;
    attemptCount: number;
    jobId: string;
    usage: GenerationUsageInput;
  }) {
    if (!this.owns(input.jobId, input.attemptCount)) return false;
    const now = this.now();
    this.job = {
      ...this.job,
      status: 'succeeded',
      error: null,
      finalAssetId: input.assetId ?? null,
      finishedAt: now.toISOString(),
      leaseExpiresAt: null,
      retryAvailableAt: null,
      updatedAt: now.toISOString(),
      usage: {
        complete: input.usage.inputTokens !== null
          && input.usage.outputTokens !== null
          && input.usage.totalTokens !== null,
        inputTokens: input.usage.inputTokens === null ? null : String(input.usage.inputTokens),
        outputTokens: input.usage.outputTokens === null ? null : String(input.usage.outputTokens),
        totalTokens: input.usage.totalTokens === null ? null : String(input.usage.totalTokens),
        providerCostUsd: input.usage.providerCostUsd ?? null,
        internalCreditsCharged: input.usage.internalCreditsCharged ?? null,
        internalCreditsBalanceAfter: input.usage.internalCreditsBalanceAfter ?? null,
      },
    };
    return true;
  }

  private owns(inputJobId: string, attemptCount: number) {
    return this.job.id === inputJobId
      && this.job.status === 'running'
      && this.job.attemptCount === attemptCount;
  }
}

function createQueuedJob(): GenerationJobDto {
  return {
    id: jobId,
    workspaceId: '01900000-0000-7000-8000-000000000001',
    documentId: '01900000-0000-7000-8000-000000000002',
    provider: 'openrouter',
    modelId: 'google/gemini-image',
    operation: 'generate_image',
    idempotencyKey: 'worker-test',
    idempotentReplay: false,
    requestObjectKey: 'generation/requests/test.json',
    resultObjectKey: null,
    providerOperationId: null,
    queueJobId: null,
    status: 'queued',
    attemptCount: 0,
    maxAttempts: 3,
    finalAssetId: null,
    leaseExpiresAt: null,
    retryAvailableAt: null,
    usage: emptyUsage,
    error: null,
    metadata: null,
    createdAt: queuedAt.toISOString(),
    enqueuedAt: queuedAt.toISOString(),
    startedAt: null,
    cancelRequestedAt: null,
    finishedAt: null,
    updatedAt: queuedAt.toISOString(),
  };
}

function mergeUsage(
  current: GenerationJobDto['usage'],
  incoming?: GenerationFailureUsageInput,
): GenerationJobDto['usage'] {
  if (!incoming) return current;
  return {
    complete: false,
    inputTokens: incoming.inputTokens === null || incoming.inputTokens === undefined
      ? current.inputTokens
      : String(incoming.inputTokens),
    outputTokens: incoming.outputTokens === null || incoming.outputTokens === undefined
      ? current.outputTokens
      : String(incoming.outputTokens),
    totalTokens: incoming.totalTokens === null || incoming.totalTokens === undefined
      ? current.totalTokens
      : String(incoming.totalTokens),
    providerCostUsd: incoming.providerCostUsd ?? current.providerCostUsd,
    internalCreditsCharged: incoming.internalCreditsCharged ?? current.internalCreditsCharged,
    internalCreditsBalanceAfter:
      incoming.internalCreditsBalanceAfter ?? current.internalCreditsBalanceAfter,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
