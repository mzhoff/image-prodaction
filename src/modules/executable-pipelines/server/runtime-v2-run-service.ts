import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { workerHeartbeat } from '@/shared/db/schema/worker';
import { asset } from '@/shared/db/schema/asset';
import { createUuidV7 } from '@/shared/lib/id';
import { executablePipeline, pipelineEndpoint, pipelineRun, pipelineVersion } from '../adapters/postgres/pipeline-schema';
import { runtimePipelineGrant, runtimeServiceClient } from '../adapters/postgres/runtime-schema';
import { runtimeV2RunRequestSchema, type RuntimeV2RunRequest } from '../contracts/runtime-v2-run-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { validatePipelineInputValues } from '../core/pipeline-executor';
import { prepareRuntimeCostSnapshot } from '../core/runtime-cost-policy';
import { authenticateRuntimeClientRequest, requireRuntimeAdmin, requireRuntimeClient, type RuntimeSessionActor, type RuntimeDatabase } from './runtime-client-auth';
import { checksumPipelineBoundarySchema } from './pipeline-publication-service';
import { fingerprintPipelineRunRequest } from './pipeline-runtime-run-service';
import { PRODUCTION_PIPELINE_NODE_MANIFEST } from './pipeline-production-manifest';
import { runtimeId, runtimeIdempotencyKey } from './runtime-v2-http';

export async function submitRuntimeV2Run(request: Request, grantId: string, body: unknown, sessionActor?: RuntimeSessionActor) {
  runtimeId(grantId);
  const data = runtimeV2RunRequestSchema.parse(body);
  const idempotencyKey = runtimeIdempotencyKey(request);
  const fingerprint = fingerprintPipelineRunRequest(data);
  return getDb().transaction(async (tx) => {
    const identity = await resolveSubmissionIdentity(tx, request, grantId, sessionActor);
    const [grant] = await tx.select().from(runtimePipelineGrant).where(and(
      eq(runtimePipelineGrant.id, grantId), eq(runtimePipelineGrant.serviceClientId, identity.serviceClientId),
    )).for('update').limit(1);
    if (!grant) throw new RuntimeV2Error('grant_not_found', 'Pipeline permission was not found.', 404);
    if (!grant.enabled) throw new RuntimeV2Error('disabled_grant', 'Pipeline permission is disabled.', 403);
    // Lookup precedes revision checks: retries retain the original request and
    // must not execute the newly pinned version after an update or rotation.
    const [existing] = await tx.select().from(pipelineRun).where(and(
      eq(pipelineRun.runtimeServiceClientId, identity.serviceClientId),
      eq(pipelineRun.runtimeGrantId, grantId), eq(pipelineRun.idempotencyKey, idempotencyKey),
    )).limit(1);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw new RuntimeV2Error('idempotency_conflict', 'This key already belongs to a different request.', 409);
      return { run: existing, idempotentReplay: true };
    }
    if (grant.revision !== data.expectedGrantRevision) throw new RuntimeV2Error('stale_grant_revision', 'The pipeline permission changed. Refresh it before starting.', 409);
    const [target] = await tx.select({ version: pipelineVersion, endpoint: pipelineEndpoint, pipeline: executablePipeline })
      .from(pipelineVersion).innerJoin(executablePipeline, eq(executablePipeline.id, pipelineVersion.pipelineId))
      .innerJoin(pipelineEndpoint, eq(pipelineEndpoint.pipelineId, executablePipeline.id))
      .where(and(eq(pipelineVersion.id, grant.pinnedVersionId), eq(executablePipeline.id, grant.pipelineId), eq(executablePipeline.workspaceId, identity.workspaceId)))
      .for('share').limit(1);
    if (!target) throw new RuntimeV2Error('pinned_version_unavailable', 'Pinned publication is unavailable.', 404);
    if (!target.endpoint.enabled || target.pipeline.status !== 'active') throw new RuntimeV2Error('pipeline_disabled', 'Pipeline is disabled.', 403);
    const { version } = target;
    verifyRuntimePublication(version, grant);
    validatePipelineInputValues(version.compiledPlan.definition.inputs, data.input, version.compiledPlan.definition.inputSemanticContract);
    await validateRuntimeInputAssets(tx, identity.workspaceId, data.input);
    const operations = version.compiledPlan.definition.nodes.map((node) => {
      const operation = PRODUCTION_PIPELINE_NODE_MANIFEST.find((op) => op.handlerType === node.handlerType && op.handlerVersion === node.handlerVersion);
      if (!operation) throw new RuntimeV2Error('pinned_version_unavailable', 'The publication has an unavailable operation.', 422);
      return operation;
    });
    const hasProviderCalls = operations.some((operation) => operation.paid);
    const cost = prepareRuntimeCostSnapshot({ requestMaximumProviderCostUsd: data.maximumProviderCostUsd, grantPolicy: grant.costPolicy, hasProviderCalls });
    await assertRuntimeWorkerAvailable(tx);
    const [client] = await tx.select().from(runtimeServiceClient).where(eq(runtimeServiceClient.id, identity.serviceClientId)).limit(1);
    const [run] = await tx.insert(pipelineRun).values({
      id: createUuidV7(), workspaceId: identity.workspaceId, pipelineId: grant.pipelineId,
      pipelineVersionId: version.id, pipelineVersion: version.version,
      runtimeServiceClientId: identity.serviceClientId, runtimeCredentialId: identity.credentialId,
      runtimeGrantId: grant.id, grantRevision: grant.revision,
      runtimeSnapshot: {
        publicId: target.endpoint.publicId, capabilityKey: grant.capabilityKey,
        sourceApplication: identity.sourceApplication, externalWorkspaceRef: client!.externalWorkspaceRef,
        checksum: version.checksum, inputSchemaChecksum: grant.inputSchemaChecksum, outputSchemaChecksum: grant.outputSchemaChecksum,
        correlationId: data.correlationId ?? null, consumerReference: data.consumerReference ?? null, cost,
      },
      sourceApplication: `runtime-v2.${identity.serviceClientId}.${grant.id}`,
      initiatorType: sessionActor ? 'runtime-session-test' : 'runtime-client', initiatorId: sessionActor?.userId ?? identity.serviceClientId,
      idempotencyKey, requestFingerprint: fingerprint, inputPayload: data.input,
      maxAttempts: grant.executionPolicy.maxAttempts, estimatedCostUsd: cost.estimate?.max ?? null,
    }).returning();
    return { run: run!, idempotentReplay: false };
  });
}

async function validateRuntimeInputAssets(db: RuntimeDatabase, workspaceId: string, value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if ((record.kind === 'image' || record.kind === 'audio') && typeof record.assetId === 'string') {
    runtimeId(record.assetId);
    const [owned] = await db.select({ id: asset.id, contentType: asset.contentType, byteSize: asset.byteSize, checksumSha256: asset.checksumSha256 }).from(asset).where(and(
      eq(asset.id, record.assetId), eq(asset.workspaceId, workspaceId), eq(asset.status, 'ready'), eq(asset.mediaKind, record.kind),
    )).limit(1);
    if (!owned) throw new RuntimeV2Error('invalid_input', 'An input artifact is unavailable in this workspace.', 422);
    if ((record.mimeType !== undefined && record.mimeType !== owned.contentType)
      || (record.sizeBytes !== undefined && record.sizeBytes !== owned.byteSize)
      || (record.checksumSha256 !== undefined && record.checksumSha256 !== owned.checksumSha256)) {
      throw new RuntimeV2Error('invalid_input', 'An input artifact does not match its stored metadata.', 422);
    }
    return;
  }
  for (const child of Object.values(value)) await validateRuntimeInputAssets(db, workspaceId, child);
}

async function resolveSubmissionIdentity(db: RuntimeDatabase, request: Request, grantId: string, actor?: RuntimeSessionActor) {
  if (!actor) return authenticateRuntimeClientRequest(request, 'pipeline.run.create', db);
  await requireRuntimeAdmin(actor, db);
  const [hint] = await db.select({ clientId: runtimePipelineGrant.serviceClientId }).from(runtimePipelineGrant)
    .innerJoin(runtimeServiceClient, eq(runtimeServiceClient.id, runtimePipelineGrant.serviceClientId))
    .where(and(eq(runtimePipelineGrant.id, grantId), eq(runtimeServiceClient.workspaceId, actor.workspaceId))).limit(1);
  if (!hint) throw new RuntimeV2Error('grant_not_found', 'Pipeline permission was not found.', 404);
  const client = await requireRuntimeClient(actor, hint.clientId, db);
  if (!client.enabled) throw new RuntimeV2Error('disabled_service_client', 'The connection is disabled.', 403);
  return { serviceClientId: client.id, credentialId: null, workspaceId: client.workspaceId, sourceApplication: client.sourceApplication };
}

export function verifyRuntimePublication(version: typeof pipelineVersion.$inferSelect, grant: {
  pinnedVersion: number; pipelineChecksum: string; inputSchemaChecksum: string; outputSchemaChecksum: string; capabilityKey: string;
}) {
  const definition = version.compiledPlan.definition;
  if (version.version !== grant.pinnedVersion || version.checksum !== grant.pipelineChecksum
    || version.inputSchemaChecksum !== grant.inputSchemaChecksum || version.outputSchemaChecksum !== grant.outputSchemaChecksum
    || version.sourceMetadata?.capabilityKey !== grant.capabilityKey
    || fingerprintPipelineRunRequest({ compiledPlan: version.compiledPlan, sourceMetadata: version.sourceMetadata }) !== version.checksum
    || checksumPipelineBoundarySchema(definition.inputs, definition.inputSemanticContract) !== version.inputSchemaChecksum
    || checksumPipelineBoundarySchema(definition.outputContracts, definition.outputSemanticContract) !== version.outputSchemaChecksum) {
    throw new RuntimeV2Error('contract_checksum_mismatch', 'The pinned publication no longer matches its immutable snapshot.', 409);
  }
}

async function assertRuntimeWorkerAvailable(db: RuntimeDatabase) {
  const [worker] = await db.select().from(workerHeartbeat).where(eq(workerHeartbeat.workerName, 'pipeline')).limit(1);
  const configured = Number(process.env.PIPELINE_WORKER_HEALTH_STALE_AFTER_MS);
  const staleAfterMs = Number.isSafeInteger(configured) && configured > 0 ? configured : 45_000;
  if (!worker || worker.status !== 'running' || !Array.isArray(worker.metadata?.runtimeApiVersions)
    || !worker.metadata.runtimeApiVersions.includes(2) || Date.now() - worker.lastSeenAt.getTime() > staleAfterMs
    || Number(worker.metadata?.consecutiveLoopErrors ?? 0) >= 3) {
    throw new RuntimeV2Error('worker_unavailable', 'The execution worker is currently unavailable. Retry with the same idempotency key.', 503);
  }
}

export function runtimeV2RequestFingerprint(input: RuntimeV2RunRequest) { return fingerprintPipelineRunRequest(input); }
