import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { workerHeartbeat } from '@/shared/db/schema/worker';
import { createUuidV7 } from '@/shared/lib/id';
import { CURRENT_TERMS_VERSION } from '@/shared/auth/terms-contract';
import { executablePipeline, pipelineEndpoint, pipelineVersion } from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { compilePipelineDefinition } from '@/modules/executable-pipelines/core/pipeline-compiler';
import { checksumPipelineBoundarySchema } from '@/modules/executable-pipelines/server/pipeline-publication-service';
import { fingerprintPipelineRunRequest } from '@/modules/executable-pipelines/server/pipeline-runtime-run-service';
import { handleRuntimeV2 } from '@/modules/executable-pipelines/server/runtime-v2-api';
import type { RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import type { RuntimeV2Grant, RuntimeV2Version } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';

export function configureRuntimeSmokeDatabase() {
  const value = process.env.RUNTIME_V2_TEST_DATABASE_URL;
  assert.ok(value, 'RUNTIME_V2_TEST_DATABASE_URL must identify an isolated disposable database; .env is never loaded.');
  const url = new URL(value);
  assert.match(url.pathname, /^\/(?:image_)?runtime_v2_[a-z0-9_]+$/i, 'Refusing a non-smoke database name.');
  process.env.DATABASE_URL = value;
}
export async function seedRuntimeSmokeActor(label: string): Promise<RuntimeSessionActor> {
  const userId = `runtime-smoke-${createUuidV7()}`;
  const workspaceId = createUuidV7();
  await getDb().insert(user).values({ id: userId, name: label, email: `${userId}@example.test`, emailVerified: true, termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION });
  await getDb().insert(workspace).values({ id: workspaceId, name: label, kind: 'team', createdByUserId: userId });
  await getDb().insert(membership).values({ workspaceId, userId, role: 'owner' });
  return { kind: 'session', userId, workspaceId };
}
export async function markRuntimeSmokeWorkerRunning() {
  const value = { workerName: 'pipeline', instanceId: 'runtime-v2-smoke', status: 'running', metadata: { consecutiveLoopErrors: 0, runtimeApiVersions: [1, 2] }, startedAt: new Date(), lastSeenAt: new Date() };
  await getDb().insert(workerHeartbeat).values(value).onConflictDoUpdate({ target: workerHeartbeat.workerName, set: value });
}
export async function seedRuntimeSmokePipeline(actor: RuntimeSessionActor, capabilityKey: string, paid = false) {
  const pipelineId = createUuidV7();
  const publicId = `pln_${createUuidV7().replaceAll('-', '')}`;
  await getDb().insert(executablePipeline).values({ id: pipelineId, workspaceId: actor.workspaceId, createdByUserId: actor.userId, name: capabilityKey, status: 'active' });
  const version = await publishRuntimeSmokeVersion(actor, pipelineId, capabilityKey, 1, false, paid);
  await getDb().insert(pipelineEndpoint).values({ id: createUuidV7(), pipelineId, publicId, activeVersionId: version.id, enabled: true, authPolicy: { mode: 'bearer', playground: 'workspace-member' }, executionPolicy: {} });
  return { pipelineId, publicId, version, capabilityKey };
}
export async function publishRuntimeSmokeVersion(actor: RuntimeSessionActor, pipelineId: string, capabilityKey: string, version: number, breaking = false, paid = false) {
  const compiledPlan = compilePipelineDefinition({ schemaVersion: 1,
    inputs: { text: { kind: 'text', required: true }, ...(breaking ? { extra: { kind: 'text' as const, required: true } } : {}) },
    outputContracts: { result: { kind: 'text', required: true } },
    nodes: [{ id: 'render', handlerType: paid ? 'ai.text.generate' : 'text.template.render', handlerVersion: '1',
      config: { template: `v${version}: @text`, variables: [{ id: 'text', alias: 'text' }] },
      inputs: { text: { source: 'pipeline-input', inputKey: 'text' } } }],
    outputs: { result: { nodeId: 'render', outputKey: 'text' } },
  });
  const sourceMetadata = { capabilityKey, inputs: [], outputs: [], nodeCount: 1, sectionId: 'smoke-section', sectionTitle: capabilityKey };
  const record = { id: createUuidV7(), pipelineId, version, compiledPlan, sourceMetadata,
    checksum: fingerprintPipelineRunRequest({ compiledPlan, sourceMetadata }),
    inputSchemaChecksum: checksumPipelineBoundarySchema(compiledPlan.definition.inputs),
    outputSchemaChecksum: checksumPipelineBoundarySchema(compiledPlan.definition.outputContracts),
    publishedByUserId: actor.userId, publishedAt: new Date() };
  await getDb().insert(pipelineVersion).values(record);
  await getDb().update(pipelineEndpoint).set({ activeVersionId: record.id }).where(eq(pipelineEndpoint.pipelineId, pipelineId));
  return record;
}
export function runtimeSmokePin(version: RuntimeV2Version | Awaited<ReturnType<typeof publishRuntimeSmokeVersion>>) {
  return { version: version.version, checksum: version.checksum, inputSchemaChecksum: version.inputSchemaChecksum, outputSchemaChecksum: version.outputSchemaChecksum };
}
export function runtimeSmokeRunBody(grant: RuntimeV2Grant, text = 'runtime smoke') {
  return { input: { text }, expectedGrantRevision: grant.revision, correlationId: 'runtime-smoke', maximumProviderCostUsd: '0.00000000' };
}
export function runtimeSmokeRequest(token: string, path: string, method = 'GET', body?: unknown, key?: string) {
  return new Request(`http://runtime-smoke.test/v2/runtime/${path}`, { method, headers: {
    authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(key ? { 'idempotency-key': key } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
export async function runtimeSmokeHttp(token: string, path: string, method = 'GET', body?: unknown, key?: string, status = 200) {
  const response = await handleRuntimeV2(runtimeSmokeRequest(token, path, method, body, key), path.split('/'));
  const result = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  return result;
}
