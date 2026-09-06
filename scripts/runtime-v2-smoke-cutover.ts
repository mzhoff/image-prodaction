import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { pipelineEndpoint, pipelineRun } from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { ensurePipelineConsumerForEndpoint } from '@/modules/executable-pipelines/server/pipeline-consumer-service';
import { createPipelineApiKey } from '@/modules/executable-pipelines/server/pipeline-api-key-service';
import { cancelPipelineRuntimeRun, getPipelineRuntimeArtifact, getPipelineRuntimeRun, postPipelineRuntimeRun } from '@/modules/executable-pipelines/server/pipeline-runtime-api';
import { createPostgresPipelineRunStore } from '@/modules/executable-pipelines/adapters/postgres/postgres-pipeline-run-store';
import { createUuidV7 } from '@/shared/lib/id';
import { handleRuntimeV2 } from '@/modules/executable-pipelines/server/runtime-v2-api';
import type { RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import type { RuntimeV2Grant } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { runtimeSmokeRequest, runtimeSmokeRunBody } from './runtime-v2-smoke-fixtures';

export async function runRuntimeProtocolCutoverChecks(input: {
  actor: RuntimeSessionActor; pipelineId: string; publicId: string; grant: RuntimeV2Grant; token: string;
}) {
  const [endpoint] = await getDb().select().from(pipelineEndpoint).where(eq(pipelineEndpoint.pipelineId, input.pipelineId)).limit(1);
  assert.ok(endpoint);
  const consumer = await ensurePipelineConsumerForEndpoint({ endpointId: endpoint.id, name: 'Cutover legacy fixture', sourceApplication: 'runtime-smoke-legacy' });
  const key = await createPipelineApiKey({ consumerId: consumer.id, createdByUserId: input.actor.userId, label: 'Cutover legacy key' });
  const v1 = (operation: string) => postPipelineRuntimeRun(new Request(`http://runtime-smoke.test/v1/pipelines/${input.publicId}/runs`, {
    method: 'POST', headers: { authorization: `Bearer ${key.token}`, 'content-type': 'application/json', 'idempotency-key': operation },
    body: JSON.stringify({ input: { text: 'cutover fixture' } }),
  }), input.publicId);
  const v2 = (operation: string) => handleRuntimeV2(runtimeSmokeRequest(input.token, `grants/${input.grant.id}/runs`, 'POST', runtimeSmokeRunBody(input.grant, 'cutover fixture'), operation), ['grants', input.grant.id, 'runs']);
  const count = async (operation: string) => (await getDb().select({ id: pipelineRun.id }).from(pipelineRun).where(and(eq(pipelineRun.pipelineId, input.pipelineId), eq(pipelineRun.idempotencyKey, operation)))).length;
  const legacyFirst = await v1('cutover-v1-first');
  assert.equal(legacyFirst.status, 202);
  const legacyRun = await legacyFirst.json();
  const rejectV2 = await v2('cutover-v1-first');
  assert.equal(rejectV2.status, 409);
  assert.equal((await rejectV2.json()).error.code, 'idempotency_protocol_conflict');
  assert.equal((await (await v1('cutover-v1-first')).json()).id, legacyRun.id);
  assert.equal(await count('cutover-v1-first'), 1);
  const currentFirst = await v2('cutover-v2-first');
  assert.equal(currentFirst.status, 202);
  const currentRun = await currentFirst.json();
  const rejectV1 = await v1('cutover-v2-first');
  assert.equal(rejectV1.status, 409);
  assert.equal((await rejectV1.json()).error.code, 'idempotency_protocol_conflict');
  assert.equal((await (await v2('cutover-v2-first')).json()).id, currentRun.id);
  assert.equal(await count('cutover-v2-first'), 1);
  const [stored] = await getDb().select().from(pipelineRun).where(eq(pipelineRun.id, currentRun.id)).limit(1);
  assert.ok(stored.runtimeServiceClientId);
  assert.equal((await createPostgresPipelineRunStore().findById(currentRun.id))?.runtimeServiceClientId, stored.runtimeServiceClientId);
  const shadowConsumer = await ensurePipelineConsumerForEndpoint({ endpointId: endpoint.id, name: 'Forged same-source v1 fixture', sourceApplication: stored.sourceApplication });
  const shadowKey = await createPipelineApiKey({ consumerId: shadowConsumer.id, createdByUserId: input.actor.userId, label: 'Same-source v1 key' });
  const shadowRequest = new Request(`http://runtime-smoke.test/v1/runs/${currentRun.id}`, { headers: { authorization: `Bearer ${shadowKey.token}` } });
  assert.equal((await getPipelineRuntimeRun(shadowRequest, currentRun.id)).status, 404);
  assert.equal((await cancelPipelineRuntimeRun(shadowRequest, currentRun.id)).status, 404);
  assert.equal((await getPipelineRuntimeArtifact(shadowRequest, currentRun.id, createUuidV7())).status, 404);
  const shadowSubmit = await postPipelineRuntimeRun(new Request(`http://runtime-smoke.test/v1/pipelines/${input.publicId}/runs`, {
    method: 'POST', headers: { authorization: `Bearer ${shadowKey.token}`, 'content-type': 'application/json', 'idempotency-key': 'cutover-v2-first' },
    body: JSON.stringify({ input: { text: 'cutover fixture' } }),
  }), input.publicId);
  assert.equal(shadowSubmit.status, 409);
  assert.equal((await shadowSubmit.json()).error.code, 'idempotency_protocol_conflict');
  assert.equal((await createPostgresPipelineRunStore().findById(currentRun.id))?.cancelRequestedAt, null);
  assert.equal(await count('cutover-v2-first'), 1);
  for (let index = 0; index < 4; index++) {
    const operation = `cutover-concurrent-${index}`;
    const responses = await Promise.all(index % 2 ? [v2(operation), v1(operation)] : [v1(operation), v2(operation)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [202, 409]);
    const denied = responses.find((response) => response.status === 409)!;
    assert.equal((await denied.json()).error.code, 'idempotency_protocol_conflict');
    assert.equal(await count(operation), 1);
  }
  return { directions: 2, concurrentRaces: 4, sameSourceV1Denied: ['read', 'cancel', 'artifact', 'submit'], maximumPhysicalRunsPerOperation: 1, legacyRunId: legacyRun.id };
}
