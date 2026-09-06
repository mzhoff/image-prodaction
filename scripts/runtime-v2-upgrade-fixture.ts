import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { createUuidV7 } from '@/shared/lib/id';
import { CURRENT_TERMS_VERSION } from '@/shared/auth/terms-contract';
import { compilePipelineDefinition } from '@/modules/executable-pipelines/core/pipeline-compiler';
import { checksumPipelineBoundarySchema } from '@/modules/executable-pipelines/server/pipeline-publication-service';
import { fingerprintPipelineRunRequest } from '@/modules/executable-pipelines/server/pipeline-runtime-run-service';

export const legacySmokeToken = 'rvr_pipe_AAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function seedLegacyRuntimeUpgrade(pool: Pool) {
  const ids = { user: 'runtime-v2-legacy-fixture', workspace: createUuidV7(), pipeline: createUuidV7(), version: createUuidV7(), endpoint: createUuidV7(), consumer: createUuidV7(), key: createUuidV7(), run: createUuidV7(), asset: createUuidV7() };
  const plan = compilePipelineDefinition({ schemaVersion: 1, inputs: { text: { kind: 'text', required: true } },
    outputContracts: { result: { kind: 'text', required: true } }, nodes: [{ id: 'render', handlerType: 'text.template.render', handlerVersion: '1', config: { template: '@text', variables: [{ id: 'text', alias: 'text' }] }, inputs: { text: { source: 'pipeline-input', inputKey: 'text' } } }], outputs: { result: { nodeId: 'render', outputKey: 'text' } } });
  await pool.query('INSERT INTO "user"(id,name,email,email_verified,terms_accepted_at,terms_version) VALUES ($1,$2,$3,true,now(),$4)', [ids.user, 'Legacy smoke', 'legacy-runtime@example.test', CURRENT_TERMS_VERSION]);
  await pool.query('INSERT INTO workspace(id,name,kind,created_by_user_id) VALUES ($1,$2,$3,$4)', [ids.workspace, 'Legacy Runtime migration smoke', 'team', ids.user]);
  await pool.query('INSERT INTO membership(workspace_id,user_id,role) VALUES ($1,$2,$3)', [ids.workspace, ids.user, 'owner']);
  await pool.query('INSERT INTO executable_pipeline(id,workspace_id,created_by_user_id,name,status) VALUES ($1,$2,$3,$4,$5)', [ids.pipeline, ids.workspace, ids.user, 'Legacy immutable publication', 'active']);
  await pool.query('INSERT INTO pipeline_version(id,pipeline_id,version,compiled_plan,checksum,input_schema_checksum,output_schema_checksum,published_by_user_id,published_at) VALUES ($1,$2,1,$3,$4,$5,$6,$7,now())', [ids.version, ids.pipeline, JSON.stringify(plan), 'legacy-checksum', checksumPipelineBoundarySchema(plan.definition.inputs), checksumPipelineBoundarySchema(plan.definition.outputContracts), ids.user]);
  await pool.query('INSERT INTO pipeline_endpoint(id,pipeline_id,active_version_id,public_id,auth_policy,execution_policy) VALUES ($1,$2,$3,$4,$5,$6)', [ids.endpoint, ids.pipeline, ids.version, 'pln_legacy_upgrade_smoke', '{}', '{}']);
  await pool.query('INSERT INTO pipeline_consumer(id,pipeline_id,pinned_version_id,name,source_application,execution_policy) VALUES ($1,$2,$3,$4,$5,$6)', [ids.consumer, ids.pipeline, ids.version, 'Legacy Content Hub', 'content-hub-local.legacy', '{"maxAttempts":1}']);
  await pool.query('INSERT INTO pipeline_api_key(id,endpoint_id,consumer_id,label,source_application,token_prefix,token_hash,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [ids.key, ids.endpoint, ids.consumer, 'Legacy fixture only', 'content-hub-local.legacy', 'AAAAAAAAAAAA', createHash('sha256').update(legacySmokeToken).digest('hex'), ids.user]);
  const input = { text: 'preserve legacy in-flight output' };
  const fingerprint = fingerprintPipelineRunRequest({ input, pipelineId: ids.pipeline, pipelineVersion: 1 });
  await pool.query('INSERT INTO pipeline_run(id,workspace_id,pipeline_id,pipeline_version_id,pipeline_version,consumer_id,api_key_id,source_application,idempotency_key,request_fingerprint,input_payload,status,attempt_count,max_attempts,started_at,lease_expires_at,actual_cost_usd,total_tokens) VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,\'running\',1,1,now(),now()+interval \'1 hour\',0.125,99)', [ids.run, ids.workspace, ids.pipeline, ids.version, ids.consumer, ids.key, 'content-hub-local.legacy', 'legacy-inflight', fingerprint, JSON.stringify(input)]);
  await pool.query('INSERT INTO asset(id,workspace_id,created_by_user_id,bucket,storage_key,original_name,content_type,byte_size,checksum_sha256,status) VALUES ($1,$2,$3,$4,$5,$6,$7,32,$8,\'ready\')', [ids.asset, ids.workspace, ids.user, 'test-only', `legacy/${ids.asset}`, 'legacy.png', 'image/png', 'a'.repeat(64)]);
  const snapshot = await legacyRows(pool, ids);
  return { ids, snapshot };
}
async function legacyRows(pool: Pool, ids: Awaited<ReturnType<typeof seedLegacyRuntimeUpgrade>>['ids']): Promise<unknown> {
  const tables = [['pipeline_api_key', ids.key], ['pipeline_version', ids.version], ['pipeline_run', ids.run], ['asset', ids.asset]];
  return Promise.all(tables.map(async ([table, id]) => (await pool.query(`SELECT row_to_json(t) AS value FROM "${table}" t WHERE id=$1`, [id])).rows[0]?.value));
}
export async function verifyLegacyRuntimeUpgrade(pool: Pool, fixture: Awaited<ReturnType<typeof seedLegacyRuntimeUpgrade>>) {
  const current = await legacyRows(pool, fixture.ids) as Record<string, unknown>[];
  const baseline = fixture.snapshot as Record<string, unknown>[];
  for (let i = 0; i < baseline.length; i++) {
    for (const [key, value] of Object.entries(baseline[i]!)) assert.deepEqual(current[i]![key], value, `Legacy value preserved: ${key}`);
  }
  assert.equal(current[2]!.runtime_service_client_id, null);
  assert.equal(current[2]!.runtime_snapshot, null);
}
