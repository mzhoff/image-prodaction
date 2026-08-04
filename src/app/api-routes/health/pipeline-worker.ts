import { count, eq, inArray } from 'drizzle-orm';
import { pipelineRun } from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { getDb } from '@/shared/db/client';
import { workerHeartbeat } from '@/shared/db/schema/worker';

export async function getPipelineWorkerHealth() {
  const db = getDb();
  const [heartbeatRows, queueRows] = await Promise.all([
    db.select({
      instanceId: workerHeartbeat.instanceId,
      lastSeenAt: workerHeartbeat.lastSeenAt,
      metadata: workerHeartbeat.metadata,
      status: workerHeartbeat.status,
    }).from(workerHeartbeat)
      .where(eq(workerHeartbeat.workerName, 'pipeline'))
      .limit(1),
    db.select({
      status: pipelineRun.status,
      total: count(),
    }).from(pipelineRun)
      .where(inArray(pipelineRun.status, ['queued', 'running']))
      .groupBy(pipelineRun.status),
  ]);
  const heartbeat = heartbeatRows[0] ?? null;
  const heartbeatAgeMs = heartbeat
    ? Math.max(0, Date.now() - heartbeat.lastSeenAt.getTime())
    : null;
  const staleAfterMs = readPositiveInteger('PIPELINE_WORKER_HEALTH_STALE_AFTER_MS', 45_000);
  const loopErrors = readLoopErrors(heartbeat?.metadata ?? null);
  const healthy = heartbeat?.status === 'running'
    && heartbeatAgeMs !== null
    && heartbeatAgeMs <= staleAfterMs
    && loopErrors < readPositiveInteger('PIPELINE_WORKER_DEGRADED_AFTER_ERRORS', 3);

  return Response.json({
    status: healthy ? 'healthy' : 'unhealthy',
    worker: heartbeat ? {
      instanceId: heartbeat.instanceId,
      status: heartbeat.status,
      lastSeenAt: heartbeat.lastSeenAt.toISOString(),
      heartbeatAgeMs,
      consecutiveLoopErrors: loopErrors,
    } : null,
    queue: {
      queued: Number(queueRows.find((row) => row.status === 'queued')?.total ?? 0),
      running: Number(queueRows.find((row) => row.status === 'running')?.total ?? 0),
    },
  }, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function readPositiveInteger(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readLoopErrors(metadata: Record<string, unknown> | null) {
  const value = metadata?.consecutiveLoopErrors;
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}
