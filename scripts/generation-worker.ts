import { config } from 'dotenv';
import { writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  GenerationWorker,
  createImageGenerationExecutor,
  reconcileOpenRouterUsageBatch,
  recoverExpiredShortAiJobs,
} from '@/modules/generation';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { workerHeartbeat } from '@/shared/db/schema/worker';

config({ path: '.env.local' });
config({ path: '.env' });

const workerName = 'generation';
const instanceId = randomUUID();
const startedAt = new Date();
const readyFile = process.env.WORKER_READY_FILE ?? '/tmp/reverie-generation-worker-ready';
const heartbeatIntervalMs = readPositiveInteger(
  'WORKER_HEARTBEAT_INTERVAL_MS',
  10_000,
);
const degradedAfterErrors = readPositiveInteger(
  'WORKER_DEGRADED_AFTER_ERRORS',
  3,
);
let consecutiveLoopErrors = 0;
let currentStatus: WorkerStatus = 'starting';
let lastLoopErrorAt: string | null = null;
let lastPollSucceededAt: string | null = null;
const worker = new GenerationWorker({
  executor: createImageGenerationExecutor(),
  heartbeatIntervalMs: readPositiveInteger('GENERATION_WORKER_LEASE_HEARTBEAT_MS', 20_000),
  leaseDurationMs: readPositiveInteger('GENERATION_WORKER_LEASE_MS', 60_000),
  pollIntervalMs: readPositiveInteger('GENERATION_WORKER_POLL_MS', 750),
  onEvent(event) {
    if (event.type !== 'poll-ok') console.info('[generation-worker]', event);
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

let heartbeatTimer: NodeJS.Timeout | undefined;
let reconciliationTimer: NodeJS.Timeout | undefined;
let stopping = false;

await updateHeartbeat('starting');
await writeFile(readyFile, instanceId, { mode: 0o600 });
currentStatus = 'running';
await updateHeartbeat('running');
heartbeatTimer = setInterval(() => {
  void updateHeartbeat(currentStatus, createHealthMetadata()).catch((error: unknown) => {
    console.error('[generation-worker] heartbeat failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  });
}, heartbeatIntervalMs);
heartbeatTimer.unref();
void reconcileUsage();
reconciliationTimer = setInterval(() => {
  void reconcileUsage();
}, readPositiveInteger('USAGE_RECONCILIATION_INTERVAL_MS', 30_000));
reconciliationTimer.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  await worker.start();
} catch (error) {
  console.error('[generation-worker] fatal error', {
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
  if (reconciliationTimer) clearInterval(reconciliationTimer);
  await updateHeartbeat('stopping', { reason }).catch(() => undefined);
  await worker.stop().catch(() => undefined);
  await rm(readyFile, { force: true }).catch(() => undefined);
  await updateHeartbeat('stopped', { reason }).catch(() => undefined);
  await getPostgresPool().end().catch(() => undefined);
}

async function reconcileUsage() {
  try {
    const recovery = await recoverExpiredShortAiJobs();
    const result = await reconcileOpenRouterUsageBatch();
    if (
      recovery.succeeded > 0
      || recovery.failed > 0
      || result.reconciled > 0
      || result.failed > 0
    ) {
      console.info('[generation-worker] recovery and usage reconciliation', {
        recovery,
        usage: result,
      });
    }
  } catch (error) {
    console.error('[generation-worker] usage reconciliation failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
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
