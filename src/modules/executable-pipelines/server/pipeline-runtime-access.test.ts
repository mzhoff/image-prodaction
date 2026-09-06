import assert from 'node:assert/strict';
import test from 'node:test';
import type { PipelineRunJob } from '../contracts/pipeline-contracts';
import { canPipelineConsumerAccessRun } from './pipeline-runtime-access';

const run: PipelineRunJob = {
  apiKeyId: 'key-a',
  attemptCount: 0,
  cancelRequestedAt: null,
  consumerId: 'consumer-a',
  createdAt: new Date('2026-08-21T00:00:00.000Z'),
  errorCode: null,
  errorMessage: null,
  finishedAt: null,
  id: 'run-a',
  idempotencyKey: 'request-a',
  input: {},
  leaseExpiresAt: null,
  maxAttempts: 3,
  pipelineId: 'pipeline-a',
  pipelineVersion: 1,
  requestFingerprint: 'fingerprint-a',
  retryAvailableAt: null,
  retryable: null,
  sourceApplication: 'shared-source-name',
  startedAt: null,
  status: 'queued',
  workspaceId: 'workspace-a',
};

test('a consumer cannot read, cancel, or fetch artifacts from another consumer run', () => {
  assert.equal(canPipelineConsumerAccessRun({
    consumerId: 'consumer-a',
    pipelineId: 'pipeline-a',
    sourceApplication: 'shared-source-name',
  }, run), true);

  assert.equal(canPipelineConsumerAccessRun({
    consumerId: 'consumer-b',
    pipelineId: 'pipeline-a',
    sourceApplication: 'shared-source-name',
  }, run), false);
});

test('legacy runs without consumer id remain isolated by pipeline and source application', () => {
  const legacyRun = { ...run, apiKeyId: null, consumerId: null };
  assert.equal(canPipelineConsumerAccessRun({
    consumerId: 'consumer-a',
    pipelineId: 'pipeline-a',
    sourceApplication: 'shared-source-name',
  }, legacyRun), true);
  assert.equal(canPipelineConsumerAccessRun({
    consumerId: 'consumer-a',
    pipelineId: 'pipeline-a',
    sourceApplication: 'another-source',
  }, legacyRun), false);
  assert.equal(canPipelineConsumerAccessRun({
    consumerId: 'consumer-a',
    pipelineId: 'pipeline-b',
    sourceApplication: 'shared-source-name',
  }, legacyRun), false);
});

test('v1 consumers cannot access v2 runs even with an identical source application or consumer id', () => {
  const identity = { consumerId: 'consumer-a', pipelineId: run.pipelineId, sourceApplication: run.sourceApplication };
  const v2 = { ...run, apiKeyId: null, consumerId: null, runtimeServiceClientId: 'service-client-a' };
  assert.equal(canPipelineConsumerAccessRun(identity, v2), false);
  assert.equal(canPipelineConsumerAccessRun(identity, { ...v2, consumerId: identity.consumerId }), false);
  assert.equal(canPipelineConsumerAccessRun(identity, { ...v2, runtimeServiceClientId: null }), true);
});
