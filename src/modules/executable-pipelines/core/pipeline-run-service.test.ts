import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import { createInMemoryPipelineRunStore } from '../testing/in-memory-pipeline-run-store';
import { createPipelineRunFixture } from '../testing/pipeline-fixtures';
import { createPipelineRun, requestPipelineRunCancel } from './pipeline-run-service';

test('run creation replays one matching idempotency request', async () => {
  const store = createInMemoryPipelineRunStore({
    now: () => new Date('2026-07-31T04:00:00.000Z'),
  });
  const input = createPipelineRunFixture();

  const first = await createPipelineRun(input, store);
  const replay = await createPipelineRun({ ...input, id: 'run-2' }, store);

  assert.equal(first.id, 'run-1');
  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.id, 'run-1');
  assert.equal(replay.idempotentReplay, true);
  assert.equal(store.list().length, 1);
});

test('run creation rejects an idempotency key reused for different input', async () => {
  const store = createInMemoryPipelineRunStore();
  await createPipelineRun(createPipelineRunFixture(), store);

  await assert.rejects(
    createPipelineRun({
      ...createPipelineRunFixture(),
      id: 'run-2',
      requestFingerprint: 'different-fingerprint',
    }, store),
    (error: unknown) => (
      error instanceof PipelineDomainError
      && error.code === 'pipeline_idempotency_conflict'
    ),
  );
});

test('idempotency keys are isolated between pipelines and source applications', async () => {
  const store = createInMemoryPipelineRunStore();
  const input = createPipelineRunFixture();
  const first = await createPipelineRun(input, store);
  const otherPipeline = await createPipelineRun({
    ...input,
    id: 'run-2',
    pipelineId: 'pipeline-2',
  }, store);
  const otherSource = await createPipelineRun({
    ...input,
    id: 'run-3',
    sourceApplication: 'lms',
  }, store);

  assert.equal(first.idempotentReplay, false);
  assert.equal(otherPipeline.idempotentReplay, false);
  assert.equal(otherSource.idempotentReplay, false);
  assert.equal(store.list().length, 3);
});

test('queued run is canceled without being claimed by a worker', async () => {
  const store = createInMemoryPipelineRunStore();
  await createPipelineRun(createPipelineRunFixture(), store);

  const canceled = await requestPipelineRunCancel(
    'run-1',
    new Date('2026-07-31T04:01:00.000Z'),
    store,
  );

  assert.equal(canceled.status, 'canceled');
  assert.equal(await store.claimNext({
    claimedAt: new Date('2026-07-31T04:02:00.000Z'),
    leaseExpiresAt: new Date('2026-07-31T04:03:00.000Z'),
  }), null);
});
