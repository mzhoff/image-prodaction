import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { runtimeV2OpenApi } from '../contracts/runtime-v2-openapi';
import { runtimeV2RunRequestSchema, runtimeV2RunSchema } from '../contracts/runtime-v2-run-contracts';
import { containsRuntimeArtifact, runtimeOutputArtifacts } from './runtime-v2-run-read';
import { verifyRuntimePublication } from './runtime-v2-run-service';
import { fingerprintPipelineRunRequest, toPipelineRuntimeRun } from './pipeline-runtime-run-service';
import { checksumPipelineBoundarySchema } from './pipeline-publication-service';
import { compilePipelineDefinition } from '../core/pipeline-compiler';
import type { pipelineVersion } from '../adapters/postgres/pipeline-schema';
import type { PipelineRunJob } from '../contracts/pipeline-contracts';

test('OpenAPI v2 uses canonical strict request/response validators and explicit idempotency', () => {
  const document = runtimeV2OpenApi();
  assert.equal(document.openapi, '3.1.0');
  assert.deepEqual(document.servers, [{ url: '/v2/runtime' }]);
  const submit = document.paths['/grants/{grantId}/runs'];
  assert.ok(submit.parameters.some((param) => param.name === 'Idempotency-Key' && param.required));
  assert.deepEqual(submit.post.requestBody?.content['application/json'].schema, z.toJSONSchema(runtimeV2RunRequestSchema));
  assert.deepEqual(submit.post.responses[202]?.content['application/json'].schema, z.toJSONSchema(runtimeV2RunSchema));
  assert.ok('/grants/{grantId}/rollback' in document.paths);
  assert.ok('/pipelines/{publicId}/versions/{version}' in document.paths);
  assert.ok(!JSON.stringify(document).includes('tokenHash'));
});
test('consumer reference field limit is identical in runtime validation and generated OpenAPI', () => {
  const requestSchema = z.toJSONSchema(runtimeV2RunRequestSchema);
  assert.equal((requestSchema.properties?.consumerReference as { maxProperties?: number }).maxProperties, 16);
  const payload = (count: number) => ({ input: {}, expectedGrantRevision: 1, consumerReference: Object.fromEntries(Array.from({ length: count }, (_, index) => [`key${index}`, 'opaque-id'])) });
  assert.equal(runtimeV2RunRequestSchema.safeParse(payload(16)).success, true);
  assert.equal(runtimeV2RunRequestSchema.safeParse(payload(17)).success, false);
});
test('artifact projection replaces private storage locations with run-scoped authenticated URLs', () => {
  const runId = '01a06168-51ef-7035-93a0-8d6a2ef41112';
  const assetId = '01a06168-51ef-7035-93a0-8d6a2ef41113';
  const source = { image: { kind: 'image', assetId, mimeType: 'image/webp', width: 128, height: 128,
    contentUrl: 'https://private-bucket.invalid/signed?secret=hidden', storageKey: 'workspace/hidden', providerSecret: 'hidden' } };
  assert.deepEqual(runtimeOutputArtifacts(source, runId), { image: { kind: 'image', assetId, mimeType: 'image/webp', width: 128, height: 128, contentUrl: `/v2/runtime/runs/${runId}/artifacts/${assetId}` } });
  assert.equal(containsRuntimeArtifact({ layers: [source] }, assetId), true);
  assert.equal(containsRuntimeArtifact({ assetId }, assetId), false);
  assert.equal(containsRuntimeArtifact(source, 'unrelated'), false);
});
test('immutable publication verification catches plan and boundary changes beyond stored checksums', () => {
  const compiledPlan = compilePipelineDefinition({ schemaVersion: 1, inputs: { text: { kind: 'text', required: true } },
    outputContracts: { result: { kind: 'text', required: true } },
    nodes: [{ id: 'render', handlerType: 'text.template.render', handlerVersion: '1', config: {}, inputs: { text: { source: 'pipeline-input', inputKey: 'text' } } }], outputs: { result: { nodeId: 'render', outputKey: 'text' } } });
  const sourceMetadata = { capabilityKey: 'smoke.text', inputs: [], outputs: [], nodeCount: 1, sectionId: 'test', sectionTitle: 'test' };
  const version: typeof pipelineVersion.$inferSelect = { id: 'version', pipelineId: 'pipeline', version: 1, compiledPlan, sourceMetadata,
    checksum: fingerprintPipelineRunRequest({ compiledPlan, sourceMetadata }),
    inputSchemaChecksum: checksumPipelineBoundarySchema(compiledPlan.definition.inputs),
    outputSchemaChecksum: checksumPipelineBoundarySchema(compiledPlan.definition.outputContracts), publishedAt: new Date(), publishedByUserId: 'user' };
  const pin = { pinnedVersion: 1, pipelineChecksum: version.checksum, inputSchemaChecksum: version.inputSchemaChecksum!, outputSchemaChecksum: version.outputSchemaChecksum!, capabilityKey: 'smoke.text' };
  assert.doesNotThrow(() => verifyRuntimePublication(version, pin));
  const mutated = structuredClone(version);
  mutated.compiledPlan.definition.nodes[0]!.config.template = 'unpublished change';
  assert.throws(() => verifyRuntimePublication(mutated, pin), { code: 'contract_checksum_mismatch' });
  assert.throws(() => verifyRuntimePublication(version, { ...pin, capabilityKey: 'foreign.capability' }), { code: 'contract_checksum_mismatch' });
});
test('legacy run projection remains exact-shape and excludes v2 usage/auth metadata', () => {
  const run: PipelineRunJob = { id: 'run', pipelineId: 'pipeline', pipelineVersion: 1, workspaceId: 'workspace', sourceApplication: 'legacy', consumerId: 'consumer', apiKeyId: 'key', idempotencyKey: 'operation', requestFingerprint: 'fingerprint', input: {},
    status: 'queued', attemptCount: 0, maxAttempts: 1, createdAt: new Date('2026-09-05T12:00:00Z'), startedAt: null, finishedAt: null, cancelRequestedAt: null, errorCode: null, errorMessage: null, leaseExpiresAt: null, retryAvailableAt: null, retryable: null };
  const result = toPipelineRuntimeRun({ run, endpointPublicId: 'public', idempotentReplay: false, result: null });
  assert.deepEqual(Object.keys(result).sort(), ['id', 'pipeline', 'status', 'outputs', 'attemptCount', 'maxAttempts', 'idempotentReplay', 'error', 'createdAt', 'startedAt', 'finishedAt', 'statusUrl'].sort());
  assert.deepEqual(result.pipeline, { publicId: 'public', version: 1 });
  assert.equal(result.statusUrl, '/v1/runs/run');
});
