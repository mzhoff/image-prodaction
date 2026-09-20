import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fingerprintPipelineRunRequest,
  readPipelineMaxAttempts,
} from './pipeline-runtime-run-service';

test('runtime request fingerprint is stable across object key order', () => {
  assert.equal(
    fingerprintPipelineRunRequest({ input: { second: 2, first: 1 }, pipelineId: 'pipeline-1' }),
    fingerprintPipelineRunRequest({ pipelineId: 'pipeline-1', input: { first: 1, second: 2 } }),
  );
});

test('runtime max attempts accepts the safe policy range and defaults otherwise', () => {
  assert.equal(readPipelineMaxAttempts({ maxAttempts: 4 }), 4);
  assert.equal(readPipelineMaxAttempts({ maxAttempts: 0 }), 3);
  assert.equal(readPipelineMaxAttempts({ maxAttempts: 11 }), 3);
  assert.equal(readPipelineMaxAttempts({}), 3);
});

test('interactive pipeline submission persists its actor and binds idempotency to that actor', async () => {
  const { submitPipelineRuntimeRun } = await import('./pipeline-runtime-run-service');
  const { createInMemoryPipelineRunStore } = await import('../testing/in-memory-pipeline-run-store');
  const store = createInMemoryPipelineRunStore();
  let actor: string | null | undefined;
  const wrapped = { ...store, createOrFind: async (input: Parameters<typeof store.createOrFind>[0]) => {
    actor = input.sessionUserId; return store.createOrFind(input);
  } };
  const input = { sessionUserId: 'member', idempotencyKey: 'same-request', pipelineInput: {}, sourceApplication: 'image-production-playground',
    target: { workspaceId: 'workspace',pipelineId: 'pipeline',pipelineVersion: 1,endpointPublicId: 'public',executionPolicy: {},
      compiledPlan: { definition: { schemaVersion: 1 as const,inputs: {},nodes: [],outputs: {} },executionLevels: [] } } };
  await submitPipelineRuntimeRun(input, wrapped);
  assert.equal(actor, 'member');
  assert.equal((await submitPipelineRuntimeRun(input, wrapped)).idempotentReplay,true);
  await assert.rejects(submitPipelineRuntimeRun({ ...input, sessionUserId: 'other-member' }, wrapped),/Idempotency/);
});
