import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { configureRuntimeSmokeDatabase } from './runtime-v2-smoke-fixtures';
import { legacySmokeToken } from './runtime-v2-upgrade-fixture';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { pipelineRun } from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { createPostgresPipelineRunStore } from '@/modules/executable-pipelines/adapters/postgres/postgres-pipeline-run-store';
import { createPostgresPipelineRunExecutor } from '@/modules/executable-pipelines/server/postgres-pipeline-run-executor';
import { getPipelineRuntimeDescriptor, getPipelineRuntimeRun, postPipelineRuntimeRun, cancelPipelineRuntimeRun, getPipelineRuntimeArtifact } from '@/modules/executable-pipelines/server/pipeline-runtime-api';

configureRuntimeSmokeDatabase();
try {
  const request = () => new Request('http://legacy-smoke.test/v1', { headers: { authorization: `Bearer ${legacySmokeToken}` } });
  const descriptorResponse = await getPipelineRuntimeDescriptor(request(), 'pln_legacy_upgrade_smoke');
  assert.equal(descriptorResponse.status, 200);
  const descriptor = await descriptorResponse.json();
  assert.deepEqual(Object.keys(descriptor).sort(), ['input', 'output', 'pipeline']);
  const [legacy] = await getDb().select().from(pipelineRun).where(eq(pipelineRun.idempotencyKey, 'legacy-inflight')).limit(1);
  assert.ok(legacy);
  const store = createPostgresPipelineRunStore();
  const run = await store.findById(legacy.id); assert.ok(run);
  const output = await createPostgresPipelineRunExecutor().execute({ run, signal: new AbortController().signal });
  assert.equal(await store.succeed({ runId: run.id, attemptCount: 1, result: output, completedAt: new Date() }), true);
  const response = await getPipelineRuntimeRun(request(), legacy.id);
  assert.equal(response.status, 200);
  const dto = await response.json();
  assert.equal(dto.status, 'succeeded');
  assert.equal(dto.outputs.result, 'preserve legacy in-flight output');
  assert.equal(Object.hasOwn(dto, 'usage'), false);
  const replay = await postPipelineRuntimeRun(new Request('http://legacy-smoke.test/v1', { method: 'POST', headers: { authorization: `Bearer ${legacySmokeToken}`, 'content-type': 'application/json', 'idempotency-key': 'legacy-inflight' }, body: JSON.stringify({ input: legacy.inputPayload }) }), 'pln_legacy_upgrade_smoke');
  assert.equal((await replay.json()).id, legacy.id);
  assert.equal((await cancelPipelineRuntimeRun(request(), legacy.id)).status, 200);
  assert.equal((await getPipelineRuntimeArtifact(request(), legacy.id, legacy.workspaceId)).status, 404);
  console.log('PASS legacy v1 descriptor/run/status/cancel/artifact isolation, same-key replay, in-flight completion after additive upgrade');
} finally { await getPostgresPool().end(); }
