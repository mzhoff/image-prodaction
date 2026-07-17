import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  GenerationJobRecord,
  GenerationJobRepository,
  GenerationUsageRecord,
  NewGenerationJobRecord,
} from './generation-job-repository';
import {
  GenerationIdempotencyConflictError,
  GenerationJobNotFoundError,
  GenerationJobTransitionError,
  GenerationJobValidationError,
  createGenerationJob,
  failGenerationJob,
  getGenerationJob,
  recoverExpiredGenerationJob,
  startGenerationJob,
  succeedGenerationJob,
  type GenerationOrchestratorDependencies,
} from './generation-orchestrator';

const workspaceId = '01900000-0000-7000-8000-000000000001';
const documentId = '01900000-0000-7000-8000-000000000002';
const jobId = '01900000-0000-7000-8000-000000000010';
const assetId = '01900000-0000-7000-8000-000000000020';
const queuedAt = new Date('2026-07-17T10:00:00.000Z');
const startedAt = new Date('2026-07-17T10:00:01.000Z');
const finishedAt = new Date('2026-07-17T10:00:02.000Z');

test('create is workspace-scoped and a matching idempotency key replays one job', async () => {
  const repository = new MemoryGenerationJobRepository();
  const accessChecks: Array<{ documentId: string | null; userId: string; workspaceId: string }> = [];
  let idSequence = 0;
  const dependencies = createDependencies(repository, {
    assertAccess: async (scope) => {
      accessChecks.push(scope);
    },
    createId: () => `01900000-0000-7000-8000-${String(++idSequence).padStart(12, '0')}`,
  });
  const input = createJobInput();

  const first = await createGenerationJob(input, dependencies);
  const replay = await createGenerationJob(input, dependencies);

  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.id, first.id);
  assert.equal(repository.records.size, 1);
  assert.equal(repository.createCalls, 2);
  assert.deepEqual(accessChecks, [
    { documentId, userId: 'user-1', workspaceId },
    { documentId, userId: 'user-1', workspaceId },
  ]);
  assert.equal(first.provider, 'openrouter');
  assert.equal(first.modelId, 'google/gemini-image');
  assert.equal(first.operation, 'generate-image');
  assert.equal(first.status, 'queued');
  assert.deepEqual(first.usage, emptyUsage);
});

test('same idempotency key cannot be reused for a different generation fingerprint', async () => {
  const repository = new MemoryGenerationJobRepository();
  const dependencies = createDependencies(repository);
  await createGenerationJob(createJobInput(), dependencies);

  await assert.rejects(
    createGenerationJob({
      ...createJobInput(),
      modelId: 'different-model',
    }, dependencies),
    GenerationIdempotencyConflictError,
  );
  assert.equal(repository.records.size, 1);
});

test('succeeded job keeps exact token, provider cost and internal credit ledger values', async () => {
  const repository = new MemoryGenerationJobRepository();
  const times = [queuedAt, startedAt, finishedAt];
  const dependencies = createDependencies(repository, {
    now: () => times.shift() ?? finishedAt,
  });
  const created = await createGenerationJob(createJobInput(), dependencies);
  const running = await startGenerationJob(created.id, dependencies);
  const succeeded = await succeedGenerationJob({
    jobId: created.id,
    assetId,
    attemptCount: running.attemptCount,
    usage: {
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      providerCostUsd: '0.00450000',
      internalCreditsCharged: '2.25000000',
      internalCreditsBalanceAfter: '97.75000000',
    },
  }, dependencies);

  assert.equal(running.attemptCount, 1);
  assert.equal(succeeded.status, 'succeeded');
  assert.equal(succeeded.finalAssetId, assetId);
  assert.deepEqual(succeeded.usage, {
    complete: true,
    inputTokens: '120',
    outputTokens: '30',
    totalTokens: '150',
    providerCostUsd: '0.00450000',
    internalCreditsCharged: '2.25000000',
    internalCreditsBalanceAfter: '97.75000000',
  });
  assert.equal(repository.succeedCalls, 1);

  const replay = await createGenerationJob(createJobInput(), dependencies);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.status, 'succeeded');
  assert.deepEqual(replay.usage, succeeded.usage);
  assert.equal(repository.records.size, 1);

  await assert.rejects(
    succeedGenerationJob({
      jobId: created.id,
      attemptCount: running.attemptCount,
      usage: {
        inputTokens: 999,
        outputTokens: 999,
        totalTokens: 1_998,
        providerCostUsd: '999',
        internalCreditsCharged: '999',
        internalCreditsBalanceAfter: '0',
      },
    }, dependencies),
    GenerationJobTransitionError,
  );
  assert.deepEqual((await getGenerationJob('user-1', created.id, repository)).usage, succeeded.usage);
});

test('failed usage is durable and a retryable job can start one more atomic attempt', async () => {
  const repository = new MemoryGenerationJobRepository();
  const times = [queuedAt, startedAt, finishedAt, new Date('2026-07-17T10:00:03.000Z')];
  const dependencies = createDependencies(repository, {
    now: () => times.shift() ?? finishedAt,
  });
  const created = await createGenerationJob(createJobInput(), dependencies);
  const running = await startGenerationJob(created.id, dependencies);
  const failed = await failGenerationJob({
    jobId: created.id,
    attemptCount: running.attemptCount,
    errorCode: ' provider_timeout ',
    errorMessage: ' Provider   did not respond ',
    retryable: true,
    usage: {
      inputTokens: 11,
      outputTokens: null,
      totalTokens: 11,
      providerCostUsd: '0.00010000',
    },
  }, dependencies);

  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.error, {
    code: 'provider_timeout',
    message: 'Provider did not respond',
    retryable: true,
  });
  assert.deepEqual(failed.usage, {
    complete: false,
    inputTokens: '11',
    outputTokens: null,
    totalTokens: '11',
    providerCostUsd: '0.00010000',
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
  });

  const retry = await startGenerationJob(created.id, dependencies);
  assert.equal(retry.status, 'running');
  assert.equal(retry.attemptCount, 2);
  assert.equal(retry.error, null);
  assert.ok(retry.leaseExpiresAt);
});

test('expired worker lease becomes a retryable failure before a new attempt starts', async () => {
  const repository = new MemoryGenerationJobRepository();
  const expiredAt = new Date('2026-07-17T10:10:00.000Z');
  const times = [startedAt, expiredAt, new Date('2026-07-17T10:10:01.000Z')];
  const dependencies = createDependencies(repository, {
    now: () => times.shift() ?? expiredAt,
  });
  const created = await createGenerationJob(createJobInput(), dependencies);
  const running = await startGenerationJob(created.id, dependencies);
  assert.ok(running.leaseExpiresAt);

  const expired = await recoverExpiredGenerationJob(created.id, dependencies);
  assert.equal(expired.status, 'failed');
  assert.deepEqual(expired.error, {
    code: 'lease_expired',
    message: 'Generation worker lease expired before completion.',
    retryable: true,
  });
  assert.equal(expired.leaseExpiresAt, null);

  const retried = await startGenerationJob(created.id, dependencies);
  assert.equal(retried.status, 'running');
  assert.equal(retried.attemptCount, 2);

  await assert.rejects(
    succeedGenerationJob({
      jobId: created.id,
      attemptCount: running.attemptCount,
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
    }, dependencies),
    GenerationJobTransitionError,
  );
  const retriedResult = await succeedGenerationJob({
    jobId: created.id,
    attemptCount: retried.attemptCount,
    usage: {
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
    },
  }, dependencies);
  assert.equal(retriedResult.status, 'succeeded');
  assert.equal(retriedResult.attemptCount, 2);
});

test('invalid ledger values and cross-user reads fail without mutating usage', async () => {
  const repository = new MemoryGenerationJobRepository();
  const dependencies = createDependencies(repository);
  const created = await createGenerationJob(createJobInput(), dependencies);
  const running = await startGenerationJob(created.id, dependencies);

  await assert.rejects(
    succeedGenerationJob({
      jobId: created.id,
      attemptCount: running.attemptCount,
      usage: {
        inputTokens: -1,
        outputTokens: 0,
        totalTokens: 0,
        providerCostUsd: '-0.1',
      },
    }, dependencies),
    GenerationJobValidationError,
  );
  assert.deepEqual((await getGenerationJob('user-1', created.id, repository)).usage, emptyUsage);
  await assert.rejects(
    getGenerationJob('outsider', created.id, repository),
    GenerationJobNotFoundError,
  );
});

test('workspace authorization runs before an idempotency record is created', async () => {
  const repository = new MemoryGenerationJobRepository();
  await assert.rejects(
    createGenerationJob(createJobInput(), createDependencies(repository, {
      assertAccess: async () => {
        throw new Error('workspace access denied');
      },
    })),
    /workspace access denied/,
  );
  assert.equal(repository.createCalls, 0);
  assert.equal(repository.records.size, 0);
});

class MemoryGenerationJobRepository implements GenerationJobRepository {
  createCalls = 0;
  failCalls = 0;
  records = new Map<string, GenerationJobRecord>();
  succeedCalls = 0;

  async createOrFind(input: NewGenerationJobRecord) {
    this.createCalls += 1;
    const existing = Array.from(this.records.values()).find((record) => (
      record.workspaceId === input.workspaceId
      && record.idempotencyKey === input.idempotencyKey
    ));
    if (existing) return { created: false, record: existing };
    const record = createRecord(input);
    this.records.set(record.id, record);
    return { created: true, record };
  }

  async fail(input: {
    attemptCount: number;
    errorCode: string;
    errorMessage: string;
    finishedAt: Date;
    id: string;
    retryable: boolean;
    usage: GenerationUsageRecord;
  }) {
    this.failCalls += 1;
    const current = this.records.get(input.id);
    if (
      !current
      || current.status !== 'running'
      || current.attemptCount !== input.attemptCount
    ) return undefined;
    return this.replace(input.id, {
      status: 'failed',
      retryable: input.retryable,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      leaseExpiresAt: null,
      finishedAt: input.finishedAt,
      updatedAt: input.finishedAt,
      usageComplete: current.usageComplete || hasCompleteUsage(input.usage),
      ...input.usage,
    });
  }

  async expireLease(id: string, expiredAt: Date) {
    const current = this.records.get(id);
    if (!current
      || current.status !== 'running'
      || (current.leaseExpiresAt && current.leaseExpiresAt >= expiredAt)) {
      return undefined;
    }
    return this.replace(id, {
      status: 'failed',
      retryable: true,
      errorCode: 'lease_expired',
      errorMessage: 'Generation worker lease expired before completion.',
      leaseExpiresAt: null,
      finishedAt: expiredAt,
      updatedAt: expiredAt,
    });
  }

  async findAccessible(id: string, userId: string) {
    const record = this.records.get(id);
    return record?.createdByUserId === userId ? record : undefined;
  }

  async findById(id: string) {
    return this.records.get(id);
  }

  async start(id: string, startedAtValue: Date, leaseExpiresAt: Date) {
    const current = this.records.get(id);
    if (!current
      || current.attemptCount >= current.maxAttempts
      || (current.status !== 'queued' && !(current.status === 'failed' && current.retryable))) {
      return undefined;
    }
    return this.replace(id, {
      status: 'running',
      attemptCount: current.attemptCount + 1,
      retryable: null,
      errorCode: null,
      errorMessage: null,
      finishedAt: null,
      leaseExpiresAt,
      startedAt: startedAtValue,
      updatedAt: startedAtValue,
    });
  }

  async succeed(input: {
    attemptCount: number;
    finalAssetId: string | null;
    finishedAt: Date;
    id: string;
    usageComplete: boolean;
    usage: GenerationUsageRecord;
  }) {
    this.succeedCalls += 1;
    const current = this.records.get(input.id);
    if (
      !current
      || current.status !== 'running'
      || current.attemptCount !== input.attemptCount
    ) return undefined;
    return this.replace(input.id, {
      status: 'succeeded',
      retryable: false,
      errorCode: null,
      errorMessage: null,
      finalAssetId: input.finalAssetId,
      leaseExpiresAt: null,
      finishedAt: input.finishedAt,
      updatedAt: input.finishedAt,
      usageComplete: current.usageComplete || input.usageComplete,
      ...input.usage,
    });
  }

  private replace(id: string, patch: Partial<GenerationJobRecord>) {
    const current = this.records.get(id);
    if (!current) return undefined;
    const updated = { ...current, ...patch };
    this.records.set(id, updated);
    return updated;
  }
}

function createDependencies(
  repository: GenerationJobRepository,
  overrides: Partial<GenerationOrchestratorDependencies> = {},
): GenerationOrchestratorDependencies {
  return {
    assertAccess: async () => undefined,
    createId: () => jobId,
    now: () => queuedAt,
    repository,
    ...overrides,
  };
}

function createJobInput() {
  return {
    userId: 'user-1',
    workspaceId,
    documentId,
    provider: ' openrouter ',
    modelId: ' google/gemini-image ',
    operation: ' generate-image ',
    idempotencyKey: ' library-generation-1 ',
    maxAttempts: 3,
    metadata: { nodeId: 'node-1' },
  };
}

function createRecord(input: NewGenerationJobRecord): GenerationJobRecord {
  return {
    ...input,
    status: 'queued',
    attemptCount: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    providerCostUsd: null,
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
    usageComplete: false,
    finalAssetId: null,
    retryable: null,
    errorCode: null,
    errorMessage: null,
    createdAt: queuedAt,
    startedAt: null,
    leaseExpiresAt: null,
    finishedAt: null,
    updatedAt: queuedAt,
  };
}

const emptyUsage = {
  complete: false,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  providerCostUsd: null,
  internalCreditsCharged: null,
  internalCreditsBalanceAfter: null,
};

function hasCompleteUsage(usage: GenerationUsageRecord) {
  return usage.inputTokens !== null
    && usage.outputTokens !== null
    && usage.totalTokens !== null;
}
