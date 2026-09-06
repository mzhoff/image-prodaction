import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { getAssetObjectStore } from '@/shared/storage/s3-assets';
import { pipelineRun } from '../adapters/postgres/pipeline-schema';
import { runtimePipelineGrant } from '../adapters/postgres/runtime-schema';
import { createPostgresPipelineRunStore } from '../adapters/postgres/postgres-pipeline-run-store';
import { runtimeV2RunSchema } from '../contracts/runtime-v2-run-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import type { PipelineValue } from '../contracts/pipeline-contracts';
import type { RuntimeV2Scope } from '../contracts/runtime-v2-contracts';
import { authenticateRuntimeClientRequest, type RuntimeClientIdentity } from './runtime-client-auth';
import { getRuntimeRunUsage } from './runtime-usage-service';
import { runtimeId, runtimeJson } from './runtime-v2-http';

export async function findOwnedRuntimeRun(identity: RuntimeClientIdentity, runId: string) {
  runtimeId(runId);
  const [row] = await getDb().select({ run: pipelineRun }).from(pipelineRun)
    .innerJoin(runtimePipelineGrant, and(eq(runtimePipelineGrant.id, pipelineRun.runtimeGrantId), eq(runtimePipelineGrant.serviceClientId, identity.serviceClientId)))
    .where(and(eq(pipelineRun.id, runId), eq(pipelineRun.runtimeServiceClientId, identity.serviceClientId), eq(pipelineRun.workspaceId, identity.workspaceId))).limit(1);
  if (!row?.run.runtimeSnapshot) throw new RuntimeV2Error('run_not_found', 'Run was not found.', 404);
  return row.run;
}

export async function runtimeV2RunDto(run: typeof pipelineRun.$inferSelect, idempotentReplay = false) {
  const snapshot = run.runtimeSnapshot;
  if (!snapshot) throw new RuntimeV2Error('run_not_found', 'Run was not found.', 404);
  return runtimeV2RunSchema.parse({
    id: run.id, serviceClientId: run.runtimeServiceClientId, grantId: run.runtimeGrantId,
    grantRevision: run.grantRevision,
    pipeline: { publicId: snapshot.publicId, version: run.pipelineVersion, capabilityKey: snapshot.capabilityKey,
      checksum: snapshot.checksum, inputSchemaChecksum: snapshot.inputSchemaChecksum, outputSchemaChecksum: snapshot.outputSchemaChecksum },
    status: run.status, outputs: run.status === 'succeeded' && run.resultPayload
      ? runtimeOutputArtifacts(run.resultPayload.outputs, run.id) : null,
    attemptCount: run.attemptCount, maxAttempts: run.maxAttempts, idempotentReplay,
    correlationId: snapshot.correlationId, consumerReference: snapshot.consumerReference,
    cost: snapshot.cost, usage: await getRuntimeRunUsage(run.id),
    error: run.errorCode ? { code: safeRuntimeRunErrorCode(run.errorCode), message: 'Pipeline execution did not complete. See run status or contact the workspace administrator.', retryable: run.retryable ?? false } : null,
    createdAt: run.createdAt.toISOString(), startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null, statusUrl: `/v2/runtime/runs/${run.id}`,
  });
}

export async function getRuntimeV2Run(request: Request, runId: string) {
  const identity = await authenticateRuntimeClientRequest(request, 'pipeline.run.read');
  return runtimeJson(await runtimeV2RunDto(await findOwnedRuntimeRun(identity, runId)));
}

export async function cancelRuntimeV2Run(request: Request, runId: string) {
  const identity = await authenticateRuntimeClientRequest(request, 'pipeline.run.cancel');
  const before = await findOwnedRuntimeRun(identity, runId);
  if (before.status === 'succeeded' || (before.status === 'failed' && !before.retryable)) {
    throw new RuntimeV2Error('cancellation_race', 'The run already finished and cannot be canceled.', 409);
  }
  await createPostgresPipelineRunStore().requestCancel({ runId, requestedAt: new Date() });
  const current = await findOwnedRuntimeRun(identity, runId);
  if (current.status === 'succeeded') throw new RuntimeV2Error('cancellation_race', 'The run completed before cancellation.', 409);
  return runtimeJson(await runtimeV2RunDto(current));
}

export async function getRuntimeV2Artifact(request: Request, runId: string, assetId: string) {
  runtimeId(assetId);
  const identity = await authenticateRuntimeClientRequest(request, 'pipeline.artifact.read' satisfies RuntimeV2Scope);
  const run = await findOwnedRuntimeRun(identity, runId);
  return readRuntimeV2Artifact(run, assetId);
}

/** Internal use only; caller must authorize client + workspace + run first. */
export async function readRuntimeV2Artifact(run: typeof pipelineRun.$inferSelect, assetId: string) {
  runtimeId(assetId);
  if (run.status !== 'succeeded') throw new RuntimeV2Error('artifact_not_ready', 'Run artifacts are not ready.', 409);
  if (!containsRuntimeArtifact(run.resultPayload?.outputs ?? null, assetId)) throw new RuntimeV2Error('artifact_not_found', 'Artifact was not found.', 404);
  // Service history belongs to the Workspace/run, not to the original
  // publisher's current user membership. No storage location crosses the API.
  const [record] = await getDb().select().from(asset).where(and(eq(asset.id, assetId), eq(asset.workspaceId, run.workspaceId))).limit(1);
  if (!record || record.status === 'deleted') throw new RuntimeV2Error('artifact_not_found', 'Artifact was not found.', 404);
  if (record.status !== 'ready') throw new RuntimeV2Error('artifact_not_ready', 'Artifact is not ready.', 409);
  const object = await getAssetObjectStore().get({ bucket: record.bucket, key: record.storageKey });
  return new Response(object.body, { headers: {
    'Cache-Control': 'private, no-store', 'Content-Type': record.contentType,
    'Content-Length': String(object.contentLength ?? record.byteSize),
    'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment',
  } });
}

export function containsRuntimeArtifact(value: PipelineValue, assetId: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsRuntimeArtifact(item, assetId));
  if (!value || typeof value !== 'object') return false;
  if ((value.kind === 'image' || value.kind === 'audio') && value.assetId === assetId) return true;
  return Object.values(value).some((item) => containsRuntimeArtifact(item, assetId));
}

export function runtimeOutputArtifacts(value: PipelineValue, runId: string): PipelineValue {
  if (Array.isArray(value)) return value.map((item) => runtimeOutputArtifacts(item, runId));
  if (!value || typeof value !== 'object') return value;
  if ((value.kind === 'image' || value.kind === 'audio') && typeof value.assetId === 'string') {
    runtimeId(value.assetId);
    const safeKeys = ['kind', 'assetId', 'mimeType', 'sizeBytes', 'width', 'height', 'checksumSha256', 'durationSeconds'];
    return { ...Object.fromEntries(Object.entries(value).filter(([key]) => safeKeys.includes(key))),
      contentUrl: `/v2/runtime/runs/${runId}/artifacts/${value.assetId}` };
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, runtimeOutputArtifacts(child, runId)]));
}

function safeRuntimeRunErrorCode(code: string) {
  return /^[a-z][a-z0-9_]{0,79}$/.test(code) ? code : 'pipeline_execution_failed';
}
