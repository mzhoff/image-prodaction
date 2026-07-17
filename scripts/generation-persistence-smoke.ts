import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import {
  failGenerationJob,
  recoverExpiredGenerationJob,
  startGenerationJob,
  succeedGenerationJob,
} from '@/entities/generation/server/generation-orchestrator';
import {
  deleteAsset,
  uploadImageAsset,
} from '@/entities/asset/server/asset-service';
import { cancelGenerationJob } from '@/modules/generation/server/generation-submission-service';
import { getWorkspaceUsage, recordUsageEvent } from '@/modules/usage';
import { CURRENT_TERMS_VERSION } from '@/shared/auth/terms-contract';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { user } from '@/shared/db/schema/auth';
import { document } from '@/shared/db/schema/document';
import { generationJob } from '@/shared/db/schema/generation';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { createUuidV7 } from '@/shared/lib/id';

config({ path: '.env.local' });
config({ path: '.env' });

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const runId = createUuidV7();
const userId = `generation-smoke-${runId}`;
const workspaceId = createUuidV7();
const documentId = createUuidV7();
const createdAssetIds: string[] = [];

try {
  await seedScope();
  await verifyAtomicPublication();
  await verifyCancellationFence();
  await verifyMultiAttemptUsageAggregation();
  await verifyUnknownProviderOutcomeFence();
  console.log('Generation persistence smoke passed.');
} finally {
  for (const assetId of createdAssetIds) {
    await deleteAsset(userId, assetId).catch(() => undefined);
  }
  await getDb().delete(workspace).where(eq(workspace.id, workspaceId)).catch(() => undefined);
  await getDb().delete(user).where(eq(user.id, userId)).catch(() => undefined);
  await getPostgresPool().end();
}

async function seedScope() {
  const now = new Date();
  await getDb().insert(user).values({
    id: userId,
    name: 'Generation Smoke User',
    email: `${userId}@example.test`,
    emailVerified: true,
    termsAcceptedAt: now,
    termsVersion: CURRENT_TERMS_VERSION,
  });
  await getDb().insert(workspace).values({
    id: workspaceId,
    name: 'Generation smoke workspace',
    kind: 'personal',
    createdByUserId: userId,
  });
  await getDb().insert(membership).values({
    workspaceId,
    userId,
    role: 'owner',
  });
  await getDb().insert(document).values({
    id: documentId,
    workspaceId,
    createdByUserId: userId,
    name: 'Generation smoke document',
  });
}

async function verifyAtomicPublication() {
  const started = await createAndStartJob('publish');
  const generated = await uploadGeneratedAsset(started.id);
  createdAssetIds.push(generated.id);
  assert.equal(generated.libraryVisible, false);

  await recordUsageEvent({
    attemptCount: started.attemptCount,
    callIndex: 0,
    generationJobId: started.id,
    inputTokens: 12,
    outputTokens: null,
    providerCostUsd: null,
    providerOperationId: 'smoke-provider-operation',
    succeeded: true,
    totalTokens: null,
  });
  await recordUsageEvent({
    attemptCount: started.attemptCount,
    callIndex: 1,
    generationJobId: started.id,
    inputTokens: 12,
    outputTokens: 8,
    providerCostUsd: '0.0042',
    providerOperationId: 'smoke-provider-operation',
    succeeded: true,
    totalTokens: 20,
    metadata: { reconciliation: true },
  });

  const completed = await succeedGenerationJob({
    assetId: generated.id,
    attemptCount: started.attemptCount,
    jobId: started.id,
    usage: {
      inputTokens: 12,
      outputTokens: 8,
      providerCostUsd: '0.0042',
      totalTokens: 20,
    },
  });
  assert.equal(completed.status, 'succeeded');

  const [published] = await getDb().select({
    libraryVisible: asset.libraryVisible,
    status: asset.status,
  }).from(asset).where(eq(asset.id, generated.id)).limit(1);
  assert.deepEqual(published, { libraryVisible: true, status: 'ready' });

  const usage = await getWorkspaceUsage(userId, workspaceId, 1);
  assert.equal(usage.summary.jobs, 1);
  assert.equal(usage.summary.totalTokens, '20');
  assert.equal(usage.summary.providerCostUsd, '0.00420000');
}

async function verifyCancellationFence() {
  const started = await createAndStartJob('cancel');
  const generated = await uploadGeneratedAsset(started.id);
  createdAssetIds.push(generated.id);

  const cancellationRequested = await cancelGenerationJob(userId, started.id);
  assert.equal(cancellationRequested.status, 'running');
  assert.ok(cancellationRequested.cancelRequestedAt);
  await recordUsageEvent({
    attemptCount: started.attemptCount,
    generationJobId: started.id,
    inputTokens: 1,
    outputTokens: 1,
    providerCostUsd: '0.001',
    providerOperationId: 'canceled-provider-operation',
    succeeded: true,
    totalTokens: 2,
  });
  const canceled = await succeedGenerationJob({
    assetId: generated.id,
    attemptCount: started.attemptCount,
    jobId: started.id,
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      providerCostUsd: '0.001',
      totalTokens: 2,
    },
  });
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.finalAssetId, null);
  const [hidden] = await getDb().select({
    libraryVisible: asset.libraryVisible,
  }).from(asset).where(eq(asset.id, generated.id)).limit(1);
  assert.equal(hidden?.libraryVisible, false);

  const usage = await getWorkspaceUsage(userId, workspaceId, 1);
  assert.equal(usage.summary.jobs, 2);
  assert.equal(usage.summary.totalTokens, '22');
}

async function verifyUnknownProviderOutcomeFence() {
  const started = await createAndStartJob('unknown-provider-outcome');
  const expiredAt = new Date(Date.now() - 1_000);
  await getDb().update(generationJob).set({
    leaseExpiresAt: expiredAt,
    providerDispatchedAt: expiredAt,
    providerDispatchedAttempt: started.attemptCount,
  }).where(eq(generationJob.id, started.id));

  const recovered = await recoverExpiredGenerationJob(started.id);
  assert.equal(recovered.status, 'failed');
  assert.equal(recovered.error?.code, 'provider_outcome_unknown');
  assert.equal(recovered.error?.retryable, false);
}

async function verifyMultiAttemptUsageAggregation() {
  const firstAttempt = await createAndStartJob('multi-attempt-usage');
  await recordUsageEvent({
    attemptCount: firstAttempt.attemptCount,
    generationJobId: firstAttempt.id,
    inputTokens: 2,
    outputTokens: 1,
    providerCostUsd: '0.001',
    providerOperationId: 'multi-attempt-provider-1',
    succeeded: false,
    totalTokens: 3,
  });
  await failGenerationJob({
    attemptCount: firstAttempt.attemptCount,
    errorCode: 'upstream_unavailable',
    errorMessage: 'Temporary smoke failure.',
    jobId: firstAttempt.id,
    retryable: true,
    usage: {
      inputTokens: 2,
      outputTokens: 1,
      providerCostUsd: '0.001',
      totalTokens: 3,
    },
  });

  const secondAttempt = await startGenerationJob(firstAttempt.id);
  await recordUsageEvent({
    attemptCount: secondAttempt.attemptCount,
    generationJobId: secondAttempt.id,
    inputTokens: 5,
    outputTokens: 2,
    providerCostUsd: '0.002',
    providerOperationId: 'multi-attempt-provider-2',
    succeeded: true,
    totalTokens: 7,
  });
  const completed = await succeedGenerationJob({
    attemptCount: secondAttempt.attemptCount,
    jobId: secondAttempt.id,
    usage: {
      inputTokens: 5,
      outputTokens: 2,
      providerCostUsd: '0.002',
      totalTokens: 7,
    },
  });

  assert.equal(completed.usage.inputTokens, '7');
  assert.equal(completed.usage.outputTokens, '3');
  assert.equal(completed.usage.totalTokens, '10');
  assert.equal(completed.usage.providerCostUsd, '0.00300000');
  assert.equal(completed.usage.complete, true);
}

async function createAndStartJob(suffix: string) {
  const id = createUuidV7();
  await getDb().insert(generationJob).values({
    id,
    workspaceId,
    documentId,
    createdByUserId: userId,
    provider: 'openrouter',
    modelId: 'test/image-model',
    operation: 'generate_image',
    idempotencyKey: `generation-smoke-${suffix}-${runId}`,
    maxAttempts: 3,
  });
  return startGenerationJob(id);
}

async function uploadGeneratedAsset(generationJobId: string) {
  return uploadImageAsset({
    bytes: onePixelPng,
    claimedContentType: 'image/png',
    documentId,
    generationJobId,
    libraryVisible: false,
    maxBytes: onePixelPng.byteLength + 1,
    metadata: { smoke: true },
    modelId: 'test/image-model',
    operation: 'generate_image',
    origin: 'generated',
    originalName: `generation-smoke-${generationJobId}.png`,
    provider: 'openrouter',
    userId,
    workspaceId,
  });
}
