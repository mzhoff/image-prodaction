import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import {
  createPostgresPipelineRunStore,
} from '@/modules/executable-pipelines/adapters/postgres/postgres-pipeline-run-store';
import {
  executablePipeline,
  pipelineRun,
  pipelineVersion,
} from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import {
  compilePipelineDefinition,
  createPipelineRun,
  requestPipelineRunCancel,
} from '@/modules/executable-pipelines';
import { CURRENT_TERMS_VERSION } from '@/shared/auth/terms-contract';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { createUuidV7 } from '@/shared/lib/id';

config({ path: '.env.local' });
config({ path: '.env' });

const userId = `pipeline-smoke-${createUuidV7()}`;
const workspaceId = createUuidV7();
const pipelineId = createUuidV7();
const versionId = createUuidV7();
const store = createPostgresPipelineRunStore();
const startedAt = new Date('2026-07-31T04:00:00.000Z');

try {
  await seedScope();
  await verifyIdempotencyAndRetry();
  await verifyQueuedCancellation();
  await verifyLeaseFence();
  console.log('Executable pipeline persistence smoke passed.');
} finally {
  await getDb().delete(workspace).where(eq(workspace.id, workspaceId)).catch(() => undefined);
  await getDb().delete(user).where(eq(user.id, userId)).catch(() => undefined);
  await getPostgresPool().end();
}

async function seedScope() {
  const now = new Date();
  await getDb().insert(user).values({
    id: userId,
    name: 'Pipeline Smoke User',
    email: `${userId}@example.test`,
    emailVerified: true,
    termsAcceptedAt: now,
    termsVersion: CURRENT_TERMS_VERSION,
  });
  await getDb().insert(workspace).values({
    id: workspaceId,
    name: 'Pipeline smoke workspace',
    kind: 'personal',
    createdByUserId: userId,
  });
  await getDb().insert(membership).values({
    workspaceId,
    userId,
    role: 'owner',
  });
  await getDb().insert(executablePipeline).values({
    id: pipelineId,
    workspaceId,
    createdByUserId: userId,
    name: 'Pipeline smoke',
    status: 'active',
  });
  await getDb().insert(pipelineVersion).values({
    id: versionId,
    pipelineId,
    version: 1,
    compiledPlan: createCompiledPlan(),
    checksum: 'pipeline-smoke-checksum',
    publishedByUserId: userId,
    publishedAt: now,
  });
}

async function verifyIdempotencyAndRetry() {
  const runId = createUuidV7();
  const input = createRunInput(runId, 'pipeline-smoke-retry');
  const created = await createPipelineRun(input, store);
  const replayed = await createPipelineRun({
    ...input,
    id: createUuidV7(),
  }, store);
  assert.equal(created.idempotentReplay, false);
  assert.equal(replayed.id, runId);
  assert.equal(replayed.idempotentReplay, true);

  const first = await store.claimNext({
    claimedAt: startedAt,
    leaseExpiresAt: addMilliseconds(startedAt, 60_000),
  });
  assert.equal(first?.id, runId);
  assert.equal(first?.attemptCount, 1);
  assert.equal(await store.heartbeat({
    runId,
    attemptCount: 1,
    heartbeatAt: addMilliseconds(startedAt, 1_000),
    leaseExpiresAt: addMilliseconds(startedAt, 61_000),
  }), 'renewed');
  assert.equal(await store.fail({
    runId,
    attemptCount: 1,
    errorCode: 'temporary_failure',
    errorMessage: 'Temporary smoke failure.',
    failedAt: addMilliseconds(startedAt, 2_000),
    retryable: true,
    retryAvailableAt: addMilliseconds(startedAt, 3_000),
  }), true);

  const second = await store.claimNext({
    claimedAt: addMilliseconds(startedAt, 4_000),
    leaseExpiresAt: addMilliseconds(startedAt, 64_000),
  });
  assert.equal(second?.id, runId);
  assert.equal(second?.attemptCount, 2);
  assert.equal(await store.succeed({
    runId,
    attemptCount: 2,
    completedAt: addMilliseconds(startedAt, 5_000),
    result: {
      nodeOutputs: { output: { text: 'done' } },
      outputs: { text: 'done' },
    },
  }), true);
  assert.deepEqual((await store.getResult(runId))?.outputs, { text: 'done' });
}

async function verifyQueuedCancellation() {
  const runId = createUuidV7();
  await createPipelineRun(createRunInput(runId, 'pipeline-smoke-cancel'), store);
  const canceled = await requestPipelineRunCancel(
    runId,
    addMilliseconds(startedAt, 10_000),
    store,
  );
  assert.equal(canceled.status, 'canceled');
}

async function verifyLeaseFence() {
  const runId = createUuidV7();
  await createPipelineRun(createRunInput(runId, 'pipeline-smoke-lease'), store);
  const first = await store.claimNext({
    claimedAt: addMilliseconds(startedAt, 20_000),
    leaseExpiresAt: addMilliseconds(startedAt, 21_000),
  });
  assert.equal(first?.id, runId);
  assert.equal(first?.attemptCount, 1);

  const reclaimed = await store.claimNext({
    claimedAt: addMilliseconds(startedAt, 22_000),
    leaseExpiresAt: addMilliseconds(startedAt, 82_000),
  });
  assert.equal(reclaimed?.id, runId);
  assert.equal(reclaimed?.attemptCount, 2);
  assert.equal(await store.succeed({
    runId,
    attemptCount: 1,
    completedAt: addMilliseconds(startedAt, 23_000),
    result: { nodeOutputs: {}, outputs: { stale: true } },
  }), false);
  assert.equal(await store.succeed({
    runId,
    attemptCount: 2,
    completedAt: addMilliseconds(startedAt, 24_000),
    result: { nodeOutputs: {}, outputs: { fresh: true } },
  }), true);

  const [record] = await getDb().select({
    attemptCount: pipelineRun.attemptCount,
    status: pipelineRun.status,
  }).from(pipelineRun).where(eq(pipelineRun.id, runId)).limit(1);
  assert.deepEqual(record, { attemptCount: 2, status: 'succeeded' });
}

function createRunInput(id: string, idempotencyKey: string) {
  return {
    id,
    workspaceId,
    pipelineId,
    pipelineVersion: 1,
    sourceApplication: 'persistence-smoke',
    idempotencyKey,
    requestFingerprint: `${idempotencyKey}-fingerprint`,
    input: { topic: 'pipelines' },
    maxAttempts: 3,
  };
}

function createCompiledPlan() {
  return compilePipelineDefinition({
    schemaVersion: 1,
    inputs: {
      topic: { kind: 'text', required: true },
    },
    nodes: [{
      id: 'output',
      handlerType: 'test.echo',
      handlerVersion: '1',
      config: {},
      inputs: {
        value: { source: 'pipeline-input', inputKey: 'topic' },
      },
    }],
    outputs: {
      text: { nodeId: 'output', outputKey: 'text' },
    },
  });
}

function addMilliseconds(date: Date, milliseconds: number) {
  return new Date(date.getTime() + milliseconds);
}
