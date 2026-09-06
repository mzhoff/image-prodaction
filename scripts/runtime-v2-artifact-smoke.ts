import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { membership } from '@/shared/db/schema/workspace';
import { getAssetObjectStore } from '@/shared/storage/s3-assets';
import { createUuidV7 } from '@/shared/lib/id';
import { pipelineRun } from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { createPostgresPipelineRunStore } from '@/modules/executable-pipelines/adapters/postgres/postgres-pipeline-run-store';
import { createPostgresPipelineRunExecutor } from '@/modules/executable-pipelines/server/postgres-pipeline-run-executor';
import { createRuntimeClient, issueRuntimeCredential } from '@/modules/executable-pipelines/server/runtime-client-service';
import { createRuntimeGrant } from '@/modules/executable-pipelines/server/runtime-grant-service';
import { handleRuntimeV2 } from '@/modules/executable-pipelines/server/runtime-v2-api';
import { PipelineWorker } from '@/modules/executable-pipelines/server/pipeline-worker';
import { runtimeV2RunSchema } from '@/modules/executable-pipelines/contracts/runtime-v2-run-contracts';
import type { RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import { configureRuntimeSmokeDatabase, markRuntimeSmokeWorkerRunning, runtimeSmokeHttp as http, runtimeSmokeRequest, seedRuntimeSmokeActor } from './runtime-v2-smoke-fixtures';
import { cleanupRuntimeArtifactSmoke, requireLocalArtifactSmokeStore, seedRuntimeArtifactPipeline } from './runtime-v2-smoke-artifact-fixture';

configureRuntimeSmokeDatabase();
requireLocalArtifactSmokeStore();
let actor: RuntimeSessionActor | undefined;
let runId: string | undefined;
let evidence: Record<string, unknown> | undefined;
try {
  assert.equal((await getDb().select({ id: pipelineRun.id }).from(pipelineRun).where(inArray(pipelineRun.status, ['queued', 'running']))).length, 0, 'Stop preview workers and finish queued fixtures before artifact smoke.');
  await getAssetObjectStore().health();
  actor = await seedRuntimeSmokeActor('Runtime v2 artifact owner');
  const outsider = await seedRuntimeSmokeActor('Runtime v2 artifact outsider');
  const client = await createRuntimeClient(actor, { displayName: 'Artifact fixture', sourceApplication: 'artifact-smoke', externalWorkspaceRef: 'artifact-owner' });
  const key = await issueRuntimeCredential(actor, client.id, { label: 'Artifact fixture key' });
  const foreignClient = await createRuntimeClient(outsider, { displayName: 'Foreign artifact fixture', sourceApplication: 'artifact-smoke', externalWorkspaceRef: 'artifact-outsider' });
  const foreignKey = await issueRuntimeCredential(outsider, foreignClient.id, { label: 'Outsider fixture key' });
  const { publicId, capabilityKey, pipelineId: _pipelineId, ...pin } = await seedRuntimeArtifactPipeline(actor);
  const grant = await createRuntimeGrant(actor, client.id, { pipeline: publicId, capabilityKey, ...pin });
  await markRuntimeSmokeWorkerRunning();
  const created = await http(key.token, `grants/${grant.id}/runs`, 'POST', { input: { text: 'Image Production Runtime v2 deterministic artifact smoke' }, expectedGrantRevision: grant.revision, maximumProviderCostUsd: '0.00000000' }, 'artifact-qr-webp', 202);
  runId = created.id;
  const worker = new PipelineWorker({ queue: createPostgresPipelineRunStore(), executor: createPostgresPipelineRunExecutor() });
  assert.equal(await worker.runOnce(), true);
  const result = runtimeV2RunSchema.parse(await http(key.token, `runs/${runId}`));
  assert.equal(result.status, 'succeeded', 'The real QR + Export production worker must succeed.');
  assert.equal(result.usage.actualProviderCostUsd, '0.00000000');
  assert.equal(result.usage.providerCallCount, 0);
  const output = result.outputs?.image;
  assert.ok(output && typeof output === 'object' && !Array.isArray(output));
  assert.equal(output.kind, 'image');
  assert.equal(output.mimeType, 'image/webp');
  assert.equal(output.width, 512); assert.equal(output.height, 512);
  assert.equal(typeof output.assetId, 'string');
  const artifactId = String(output.assetId);
  const path = `runs/${runId}/artifacts/${artifactId}`;
  assert.equal(output.contentUrl, `/v2/runtime/${path}`);
  assert.equal(JSON.stringify(result).includes('storageKey'), false);
  assert.equal(JSON.stringify(result).includes(process.env.S3_ENDPOINT!), false);
  const download = () => handleRuntimeV2(runtimeSmokeRequest(key.token, path), path.split('/'));
  const firstDownload = await download();
  assert.equal(firstDownload.status, 200);
  assert.equal(firstDownload.headers.get('content-type'), 'image/webp');
  assert.equal(firstDownload.headers.get('cache-control'), 'private, no-store');
  assert.equal(firstDownload.headers.get('x-content-type-options'), 'nosniff');
  const bytes = Buffer.from(await firstDownload.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.equal(Number(firstDownload.headers.get('content-length')), bytes.length);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  assert.equal(output.checksumSha256, checksum);
  assert.equal(output.sizeBytes, bytes.length);
  const [stored] = await getDb().select().from(asset).where(and(eq(asset.id, artifactId), eq(asset.workspaceId, actor.workspaceId))).limit(1);
  assert.ok(stored); assert.equal(stored.checksumSha256, checksum); assert.equal(stored.contentType, 'image/webp');
  await http(foreignKey.token, path, 'GET', undefined, undefined, 404);
  await http(key.token, `runs/${runId}/artifacts/${createUuidV7()}`, 'GET', undefined, undefined, 404);
  const runAssets = await getDb().select().from(asset).where(and(eq(asset.workspaceId, actor.workspaceId), eq(asset.createdByUserId, actor.userId)));
  const internalQr = runAssets.find((entry) => entry.operation === 'pipeline_qr_generate');
  assert.ok(internalQr, 'QR intermediate asset must be present for undeclared-output test.');
  await http(key.token, `runs/${runId}/artifacts/${internalQr.id}`, 'GET', undefined, undefined, 404);
  // Service identity owns historical run access, not the publishing user's current membership.
  await getDb().delete(membership).where(and(eq(membership.workspaceId, actor.workspaceId), eq(membership.userId, actor.userId)));
  const afterPublisherRemoved = await download();
  assert.equal(afterPublisherRemoved.status, 200);
  assert.equal(createHash('sha256').update(Buffer.from(await afterPublisherRemoved.arrayBuffer())).digest('hex'), checksum);
  evidence = { status: 'passed', runId, assetId: artifactId, format: 'webp', width: 512, height: 512, bytes: bytes.length, sha256: checksum,
    productionHandlers: ['image.qr.generate@1', 'image.export@1'], providerCalls: 0,
    outsiderDenied: true, undeclaredIntermediateDenied: true, publisherMembershipIndependent: true };
} finally {
  try {
    if (actor && runId) {
      const cleanup = await cleanupRuntimeArtifactSmoke(actor, runId);
      console.log(JSON.stringify({ ...(evidence ?? { status: 'failed' }), cleanup }, null, 2));
    }
  } finally { await getPostgresPool().end(); }
}
