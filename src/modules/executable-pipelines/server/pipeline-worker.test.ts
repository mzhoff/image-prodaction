import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  PipelineRunExecutor,
  PipelineRunQueue,
} from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { createPipelineRun } from '../core/pipeline-run-service';
import { createInMemoryPipelineRunStore } from '../testing/in-memory-pipeline-run-store';
import { createPipelineRunFixture } from '../testing/pipeline-fixtures';
import { PipelineWorker } from './pipeline-worker';

test('worker retries a retryable run and commits only the fenced attempt', async () => {
  let clock = new Date('2026-07-31T04:00:00.000Z');
  const store = createInMemoryPipelineRunStore({ now: () => clock });
  await createPipelineRun(createPipelineRunFixture(), store);
  let executions = 0;
  const executor: PipelineRunExecutor = {
    async execute() {
      executions += 1;
      if (executions === 1) {
        throw new PipelineNodeHandlerError({
          message: 'Temporary provider failure.',
          retryable: true,
        });
      }
      return {
        nodeOutputs: { node: { text: 'done' } },
        outputs: { text: 'done' },
      };
    },
  };
  const worker = createWorker(store, executor, () => clock);

  assert.equal(await worker.runOnce(), true);
  assert.equal(store.list()[0].status, 'failed');
  assert.equal(store.list()[0].retryable, true);

  clock = new Date(clock.getTime() + 100);
  assert.equal(await worker.runOnce(), true);
  assert.equal(store.list()[0].status, 'succeeded');
  assert.equal(store.list()[0].attemptCount, 2);
  assert.deepEqual(store.getResult('run-1')?.outputs, { text: 'done' });
});

test('worker observes cancellation and does not commit a result', async () => {
  const clock = new Date('2026-07-31T04:00:00.000Z');
  const store = createInMemoryPipelineRunStore({ now: () => clock });
  await createPipelineRun(createPipelineRunFixture(), store);
  const executor: PipelineRunExecutor = {
    async execute({ run, signal }) {
      await store.requestCancel({
        runId: run.id,
        requestedAt: clock,
      });
      await waitForAbort(signal);
      throw signal.reason;
    },
  };
  const worker = new PipelineWorker({
    queue: store,
    executor,
    now: () => clock,
    heartbeatIntervalMs: 1,
    leaseDurationMs: 100,
    pollIntervalMs: 1,
  });

  assert.equal(await worker.runOnce(), true);
  assert.equal(store.list()[0].status, 'canceled');
  assert.equal(store.getResult('run-1'), null);
});

test('worker cannot commit after heartbeat reports lease loss', async () => {
  const clock = new Date('2026-07-31T04:00:00.000Z');
  const store = createInMemoryPipelineRunStore({ now: () => clock });
  await createPipelineRun(createPipelineRunFixture(), store);
  const events: string[] = [];
  const queue: PipelineRunQueue = {
    ...store,
    async heartbeat() {
      return 'lost';
    },
  };
  const executor: PipelineRunExecutor = {
    async execute({ signal }) {
      await waitForAbort(signal);
      throw signal.reason;
    },
  };
  const worker = new PipelineWorker({
    queue,
    executor,
    now: () => clock,
    onEvent: (event) => events.push(event.type),
    heartbeatIntervalMs: 1,
    leaseDurationMs: 100,
    pollIntervalMs: 1,
  });

  assert.equal(await worker.runOnce(), true);
  assert.equal(store.list()[0].status, 'running');
  assert.equal(store.getResult('run-1'), null);
  assert.ok(events.includes('lease-lost'));
});

function createWorker(
  queue: PipelineRunQueue,
  executor: PipelineRunExecutor,
  now: () => Date,
) {
  return new PipelineWorker({
    queue,
    executor,
    now,
    heartbeatIntervalMs: 10,
    leaseDurationMs: 1_000,
    pollIntervalMs: 1,
    retryPolicy: {
      nextDelayMs: () => 100,
    },
  });
}

function waitForAbort(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}
