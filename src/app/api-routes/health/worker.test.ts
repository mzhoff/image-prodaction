import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getGenerationWorkerHealth,
  type WorkerHealthDependencies,
  type WorkerHealthSnapshot,
} from './worker';

const now = new Date('2026-07-17T12:00:00.000Z');

test('worker health is green for a recent running heartbeat', async () => {
  const response = await getGenerationWorkerHealth(dependencies({
    heartbeat: {
      instanceId: 'worker-1',
      lastSeenAt: new Date(now.getTime() - 5_000),
      metadata: { consecutiveLoopErrors: 0 },
      status: 'running',
    },
    queue: { queued: 2, running: 1 },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'healthy',
    worker: {
      instanceId: 'worker-1',
      status: 'running',
      lastSeenAt: '2026-07-17T11:59:55.000Z',
      heartbeatAgeMs: 5_000,
      consecutiveLoopErrors: 0,
    },
    queue: { queued: 2, running: 1 },
  });
});

test('worker health is unavailable for a stale heartbeat', async () => {
  const response = await getGenerationWorkerHealth(dependencies({
    heartbeat: {
      instanceId: 'worker-1',
      lastSeenAt: new Date(now.getTime() - 46_000),
      metadata: { consecutiveLoopErrors: 0 },
      status: 'running',
    },
    queue: { queued: 3, running: 0 },
  }));

  assert.equal(response.status, 503);
  assert.equal((await response.json() as { status: string }).status, 'unhealthy');
});

test('worker health is unavailable after repeated queue-loop failures', async () => {
  const response = await getGenerationWorkerHealth(dependencies({
    heartbeat: {
      instanceId: 'worker-1',
      lastSeenAt: new Date(now.getTime() - 2_000),
      metadata: { consecutiveLoopErrors: 3 },
      status: 'running',
    },
    queue: { queued: 4, running: 0 },
  }));

  assert.equal(response.status, 503);
  const body = await response.json() as {
    status: string;
    worker: { consecutiveLoopErrors: number };
  };
  assert.equal(body.status, 'unhealthy');
  assert.equal(body.worker.consecutiveLoopErrors, 3);
});

function dependencies(snapshot: WorkerHealthSnapshot): WorkerHealthDependencies {
  return {
    loadSnapshot: async () => snapshot,
    now: () => now,
    staleAfterMs: 45_000,
  };
}
