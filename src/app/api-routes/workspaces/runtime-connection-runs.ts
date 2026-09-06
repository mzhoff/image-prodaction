import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { pipelineRun } from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { createPostgresPipelineRunStore } from '@/modules/executable-pipelines/adapters/postgres/postgres-pipeline-run-store';
import { RuntimeV2Error } from '@/modules/executable-pipelines/contracts/runtime-v2-errors';
import { requireRuntimeClient, type RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import { runtimeV2RunDto, readRuntimeV2Artifact } from '@/modules/executable-pipelines/server/runtime-v2-run-read';
import { runtimeId, runtimeJson } from '@/modules/executable-pipelines/server/runtime-v2-http';

export async function handleRuntimeConnectionRun(request: Request, actor: RuntimeSessionActor, clientId: string, path: string[]) {
  await requireRuntimeClient(actor, clientId);
  const [runId, action, assetId] = path;
  if (!runId) throw new RuntimeV2Error('run_not_found', 'Run was not found.', 404);
  runtimeId(runId);
  const [run] = await getDb().select().from(pipelineRun).where(and(
    eq(pipelineRun.id, runId), eq(pipelineRun.runtimeServiceClientId, clientId), eq(pipelineRun.workspaceId, actor.workspaceId),
  )).limit(1);
  if (!run?.runtimeSnapshot) throw new RuntimeV2Error('run_not_found', 'Run was not found.', 404);
  if (action === 'artifacts' && assetId && path.length === 3 && request.method === 'GET') return readRuntimeV2Artifact(run, assetId);
  if (!action && request.method === 'GET') return runtimeJson({ run: await runtimeV2RunDto(run) });
  if (action === 'cancel' && path.length === 2 && request.method === 'POST') {
    if (run.status === 'succeeded' || (run.status === 'failed' && !run.retryable)) throw new RuntimeV2Error('cancellation_race', 'The run already finished.', 409);
    const current = await createPostgresPipelineRunStore().requestCancel({ runId, requestedAt: new Date() });
    if (current?.status === 'succeeded') throw new RuntimeV2Error('cancellation_race', 'The run completed before cancellation.', 409);
    return handleRuntimeConnectionRun(new Request(request.url), actor, clientId, [runId]);
  }
  throw new RuntimeV2Error('not_found', 'Run route was not found.', 404);
}
