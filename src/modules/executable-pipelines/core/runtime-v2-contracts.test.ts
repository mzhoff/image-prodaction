import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { runtimeV2ClientSchema, runtimeV2CreateClientSchema, runtimeV2CreateGrantSchema, runtimeV2CredentialSchema, runtimeV2IssueCredentialSchema } from '../contracts/runtime-v2-contracts';
import { runtimeV2GrantSchema, runtimeV2PipelineSchema } from '../contracts/runtime-v2-descriptor-contracts';
import { runtimeV2SemanticJsonSchema } from '../contracts/runtime-v2-semantic-schema';

test('client creation is workspace-selector free and excludes grant management by default', () => {
  const body = { displayName: 'Content Hub', sourceApplication: 'content-hub-local', externalWorkspaceRef: 'opaque-workspace' };
  const parsed = runtimeV2CreateClientSchema.parse(body);
  assert.equal(parsed.scopes.includes('pipeline.grants.manage'), false);
  assert.equal(runtimeV2CreateClientSchema.safeParse({ ...body, workspaceId: 'other' }).success, false);
  assert.equal(runtimeV2CreateClientSchema.safeParse({ ...body, scopes: ['pipeline.run.read', 'pipeline.run.read'] }).success, false);
  assert.equal((z.toJSONSchema(runtimeV2CreateClientSchema).properties?.scopes as { uniqueItems?: boolean }).uniqueItems, true);
});
test('grant input is pinned and strict-cost by default and refuses numeric money', () => {
  const body = { pipeline: 'pln_example123', capabilityKey: 'content.summary', version: 1, checksum: 'a'.repeat(64), inputSchemaChecksum: 'b'.repeat(64), outputSchemaChecksum: 'c'.repeat(64) };
  assert.deepEqual(runtimeV2CreateGrantSchema.parse(body).costPolicy, { mode: 'STRICT', maximumProviderCostUsd: null });
  assert.equal(runtimeV2CreateGrantSchema.parse(body).updatePolicy, 'PINNED');
  assert.equal(runtimeV2CreateGrantSchema.safeParse({ ...body, costPolicy: { mode: 'STRICT', maximumProviderCostUsd: 0.1 } }).success, false);
});
test('canonical public metadata cannot contain credential hash or raw token', () => {
  const schema = z.toJSONSchema(runtimeV2CredentialSchema);
  assert.equal('tokenHash' in (schema.properties ?? {}), false);
  assert.equal('token' in (schema.properties ?? {}), false);
  assert.equal(z.toJSONSchema(runtimeV2ClientSchema).additionalProperties, false);
  assert.deepEqual(runtimeV2IssueCredentialSchema.parse({ label: 'Primary' }), { label: 'Primary', scopes: null, expiresAt: null });
});
test('canonical catalog and grant schemas generate portable JSON schema without canvas internals', () => {
  for (const schema of [runtimeV2GrantSchema, runtimeV2PipelineSchema]) {
    const json = z.toJSONSchema(schema);
    assert.equal(json.type, 'object');
    assert.equal(json.additionalProperties, false);
    assert.equal('compiledPlan' in (json.properties ?? {}), false);
    assert.equal('sourceMetadata' in (json.properties ?? {}), false);
    assert.equal('originDocumentId' in (json.properties ?? {}), false);
  }
  assert.equal(runtimeV2SemanticJsonSchema.safeParse({ type: 'array', items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' } } } }).success, true);
  assert.equal(runtimeV2SemanticJsonSchema.safeParse({ type: 'object', additionalProperties: true, properties: {} }).success, false);
});
