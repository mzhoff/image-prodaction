import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { createPostgresPipelineRunStore } from '@/modules/executable-pipelines/adapters/postgres/postgres-pipeline-run-store';
import { createPostgresPipelineRunExecutor } from '@/modules/executable-pipelines/server/postgres-pipeline-run-executor';
import { PipelineWorker } from '@/modules/executable-pipelines/server/pipeline-worker';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { workerHeartbeat } from '@/shared/db/schema/worker';

config({ path: '.env.local' });
config({ path: '.env' });

const workerName = 'pipeline';
const instanceId = randomUUID();
const startedAt = new Date();
const readyFile = process.env.PIPELINE_WORKER_READY_FILE
  ?? '/tmp/reverie-pipeline-worker-ready';
const heartbeatIntervalMs = readPositiveInteger(
  'PIPELINE_WORKER_HEARTBEAT_INTERVAL_MS',
  10_000,
);
const degradedAfterErrors = readPositiveInteger(
  'PIPELINE_WORKER_DEGRADED_AFTER_ERRORS',
  3,
);
let consecutiveLoopErrors = 0;
let currentStatus: WorkerStatus = 'starting';
let lastLoopErrorAt: string | null = null;
let lastPollSucceededAt: string | null = null;
let stopping = false;

const worker = new PipelineWorker({
  executor: createPostgresPipelineRunExecutor(),
  queue: createPostgresPipelineRunStore(),
  heartbeatIntervalMs: readPositiveInteger('PIPELINE_WORKER_LEASE_HEARTBEAT_MS', 20_000),
  leaseDurationMs: readPositiveInteger('PIPELINE_WORKER_LEASE_MS', 60_000),
  pollIntervalMs: readPositiveInteger('PIPELINE_WORKER_POLL_MS', 500),
  onEvent(event) {
    if (event.type !== 'poll-ok') console.info('[pipeline-worker]', event);
    if (event.type === 'loop-error') {
      consecutiveLoopErrors += 1;
      lastLoopErrorAt = new Date().toISOString();
      if (consecutiveLoopErrors >= degradedAfterErrors && currentStatus !== 'degraded') {
        currentStatus = 'degraded';
        void rm(readyFile, { force: true });
        void updateHeartbeat('degraded', createHealthMetadata());
      }
      return;
    }
    if (event.type === 'poll-ok') {
      lastPollSucceededAt = new Date().toISOString();
      if (consecutiveLoopErrors > 0) consecutiveLoopErrors = 0;
      if (currentStatus === 'degraded') {
        currentStatus = 'running';
        void writeFile(readyFile, instanceId, { mode: 0o600 });
        void updateHeartbeat('running', createHealthMetadata());
      }
    }
  },
});

await updateHeartbeat('starting');
await writeFile(readyFile, instanceId, { mode: 0o600 });
currentStatus = 'running';
await updateHeartbeat('running');
const heartbeatTimer = setInterval(() => {
  void updateHeartbeat(currentStatus, createHealthMetadata()).catch((error: unknown) => {
    console.error('[pipeline-worker] heartbeat failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  });
}, heartbeatIntervalMs);
heartbeatTimer.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void shutdown(signal));
}

try {
  await worker.start();
} catch (error) {
  console.error('[pipeline-worker] fatal error', {
    message: error instanceof Error ? error.message : 'unknown error',
  });
  process.exitCode = 1;
} finally {
  await shutdown('worker-loop-finished');
}

async function shutdown(reason: string) {
  if (stopping) return;
  stopping = true;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await updateHeartbeat('stopping', { reason }).catch(() => undefined);
  await worker.stop().catch(() => undefined);
  await rm(readyFile, { force: true }).catch(() => undefined);
  await updateHeartbeat('stopped', { reason }).catch(() => undefined);
  await getPostgresPool().end().catch(() => undefined);
}

async function updateHeartbeat(
  status: WorkerStatus,
  metadata: Record<string, unknown> | null = null,
) {
  const now = new Date();
  await getDb().insert(workerHeartbeat).values({
    workerName,
    instanceId,
    status,
    metadata,
    startedAt,
    lastSeenAt: now,
  }).onConflictDoUpdate({
    target: workerHeartbeat.workerName,
    set: {
      instanceId,
      status,
      metadata,
      startedAt,
      lastSeenAt: now,
    },
  });
}

function createHealthMetadata() {
  return {
    consecutiveLoopErrors,
    degradedAfterErrors,
    lastLoopErrorAt,
    lastPollSucceededAt,
  };
}

function readPositiveInteger(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

type WorkerStatus = 'starting' | 'running' | 'degraded' | 'stopping' | 'stopped';
