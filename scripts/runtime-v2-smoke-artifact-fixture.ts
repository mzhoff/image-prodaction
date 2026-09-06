import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { asset, assetVariant } from '@/shared/db/schema/asset';
import { createUuidV7 } from '@/shared/lib/id';
import { getAssetObjectStore, getConfiguredAssetBucket } from '@/shared/storage/s3-assets';
import { executablePipeline, pipelineEndpoint, pipelineVersion } from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { compilePipelineDefinition } from '@/modules/executable-pipelines/core/pipeline-compiler';
import { fingerprintPipelineRunRequest } from '@/modules/executable-pipelines/server/pipeline-runtime-run-service';
import { checksumPipelineBoundarySchema } from '@/modules/executable-pipelines/server/pipeline-publication-service';
import type { RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';

export function requireLocalArtifactSmokeStore() {
  assert.ok(process.env.S3_ENDPOINT, 'A local MinIO endpoint must be explicitly supplied.');
  const endpoint = new URL(process.env.S3_ENDPOINT);
  assert.ok(['localhost', '127.0.0.1', '[::1]', 'host.docker.internal', 'minio'].includes(endpoint.hostname), 'Artifact smoke refuses non-local storage.');
  assert.ok(['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password);
  assert.ok(process.env.S3_BUCKET, 'An existing local MinIO bucket must be explicitly supplied.');
}
export async function seedRuntimeArtifactPipeline(actor: RuntimeSessionActor) {
  const pipelineId = createUuidV7(); const versionId = createUuidV7();
  const publicId = `pln_${createUuidV7().replaceAll('-', '')}`;
  const capabilityKey = 'runtime.smoke.qr-export';
  const compiledPlan = compilePipelineDefinition({ schemaVersion: 1,
    inputs: { text: { kind: 'text', required: true } }, outputContracts: { image: { kind: 'image', required: true } },
    nodes: [
      { id: 'qr', handlerType: 'image.qr.generate', handlerVersion: '1', config: { contentMode: 'text' }, inputs: { text: { source: 'pipeline-input', inputKey: 'text' } } },
      { id: 'export', handlerType: 'image.export', handlerVersion: '1', config: { format: 'webp', scale: '0.5', quality: '90', background: 'white' }, inputs: { image: { source: 'node-output', nodeId: 'qr', outputKey: 'image' } } },
    ], outputs: { image: { nodeId: 'export', outputKey: 'image' } },
  });
  const sourceMetadata = { capabilityKey, sectionId: 'artifact-smoke', sectionTitle: 'QR + WebP Export', inputs: [], outputs: [], nodeCount: 2 };
  const pin = { version: 1, checksum: fingerprintPipelineRunRequest({ compiledPlan, sourceMetadata }),
    inputSchemaChecksum: checksumPipelineBoundarySchema(compiledPlan.definition.inputs), outputSchemaChecksum: checksumPipelineBoundarySchema(compiledPlan.definition.outputContracts) };
  await getDb().insert(executablePipeline).values({ id: pipelineId, workspaceId: actor.workspaceId, createdByUserId: actor.userId, name: 'Runtime artifact smoke', status: 'active' });
  await getDb().insert(pipelineVersion).values({ id: versionId, pipelineId, compiledPlan, sourceMetadata, ...pin, publishedByUserId: actor.userId, publishedAt: new Date() });
  await getDb().insert(pipelineEndpoint).values({ id: createUuidV7(), pipelineId, publicId, activeVersionId: versionId, enabled: true, authPolicy: { mode: 'bearer', playground: 'workspace-member' }, executionPolicy: {} });
  return { publicId, pipelineId, capabilityKey, ...pin };
}

/** Deletes exact original/variant object keys owned by this test actor + run only. Never lists a bucket. */
export async function cleanupRuntimeArtifactSmoke(actor: RuntimeSessionActor, runId: string) {
  const rows = await getDb().select().from(asset).where(and(eq(asset.workspaceId, actor.workspaceId), eq(asset.createdByUserId, actor.userId), sql`${asset.metadata}->>'pipelineRunId' = ${runId}`));
  const variants = rows.length ? await getDb().select().from(assetVariant).where(inArray(assetVariant.assetId, rows.map((row) => row.id))) : [];
  const allowedPrefix = `workspaces/${actor.workspaceId}/documents/unassigned/assets/`;
  const configuredBucket = getConfiguredAssetBucket();
  const objects = [...rows.map((row) => ({ ...row, assetId: row.id })), ...variants];
  // Validate the entire allowlist before deleting anything.
  for (const object of objects) {
    assert.equal(object.bucket, configuredBucket, 'Fixture bucket must match the configured local store.');
    assert.ok(object.storageKey.startsWith(`${allowedPrefix}${object.assetId}.`), 'Refusing to delete a key outside the exact fixture asset prefix.');
  }
  let deletedObjects = 0;
  for (const object of objects) {
    await getAssetObjectStore().delete({ bucket: object.bucket, key: object.storageKey });
    deletedObjects++;
  }
  if (rows.length) await getDb().update(asset).set({ status: 'deleted', deletedAt: new Date() }).where(inArray(asset.id, rows.map((row) => row.id)));
  return { deletedObjects, deletedBytes: objects.reduce((sum, object) => sum + object.byteSize, 0), assetIds: rows.map((row) => row.id) };
}
