import { count, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { workerHeartbeat } from '@/shared/db/schema/worker';

export interface WorkerHealthSnapshot {
  heartbeat: {
    instanceId: string;
    lastSeenAt: Date;
    metadata: Record<string, unknown> | null;
    status: string;
  } | null;
  queue: {
    queued: number;
    running: number;
  };
}

export interface WorkerHealthDependencies {
  loadSnapshot(): Promise<WorkerHealthSnapshot>;
  now(): Date;
  staleAfterMs: number;
}

export async function getGenerationWorkerHealth(
  dependencies: WorkerHealthDependencies = createDependencies(),
) {
  const snapshot = await dependencies.loadSnapshot();
  const heartbeatAgeMs = snapshot.heartbeat
    ? Math.max(0, dependencies.now().getTime() - snapshot.heartbeat.lastSeenAt.getTime())
    : null;
  const healthy = snapshot.heartbeat?.status === 'running'
    && heartbeatAgeMs !== null
    && heartbeatAgeMs <= dependencies.staleAfterMs
    && readConsecutiveLoopErrors(snapshot.heartbeat.metadata) <
      readPositiveInteger('WORKER_DEGRADED_AFTER_ERRORS', 3);

  return Response.json({
    status: healthy ? 'healthy' : 'unhealthy',
    worker: snapshot.heartbeat
      ? {
          instanceId: snapshot.heartbeat.instanceId,
          status: snapshot.heartbeat.status,
          lastSeenAt: snapshot.heartbeat.lastSeenAt.toISOString(),
          heartbeatAgeMs,
          consecutiveLoopErrors: readConsecutiveLoopErrors(snapshot.heartbeat.metadata),
        }
      : null,
    queue: snapshot.queue,
  }, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function createDependencies(): WorkerHealthDependencies {
  return {
    loadSnapshot,
    now: () => new Date(),
    staleAfterMs: readPositiveInteger('WORKER_HEALTH_STALE_AFTER_MS', 45_000),
  };
}

async function loadSnapshot(): Promise<WorkerHealthSnapshot> {
  const db = getDb();
  const [heartbeatRows, queueRows] = await Promise.all([
    db.select({
      instanceId: workerHeartbeat.instanceId,
      lastSeenAt: workerHeartbeat.lastSeenAt,
      metadata: workerHeartbeat.metadata,
      status: workerHeartbeat.status,
    }).from(workerHeartbeat)
      .where(eq(workerHeartbeat.workerName, 'generation'))
      .limit(1),
    db.select({
      status: generationJob.status,
      total: count(),
    }).from(generationJob)
      .where(inArray(generationJob.status, ['queued', 'running']))
      .groupBy(generationJob.status),
  ]);

  return {
    heartbeat: heartbeatRows[0] ?? null,
    queue: {
      queued: Number(queueRows.find((row) => row.status === 'queued')?.total ?? 0),
      running: Number(queueRows.find((row) => row.status === 'running')?.total ?? 0),
    },
  };
}

function readPositiveInteger(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readConsecutiveLoopErrors(metadata: Record<string, unknown> | null) {
  const value = metadata?.consecutiveLoopErrors;
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}
