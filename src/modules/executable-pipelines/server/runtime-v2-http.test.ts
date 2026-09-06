import assert from 'node:assert/strict';
import test from 'node:test';
import { readRuntimeBody, runtimeError, runtimeId, runtimeIdempotencyKey } from './runtime-v2-http';
import { handleRuntimeV2 } from './runtime-v2-api';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { RuntimeCostError } from '../core/runtime-cost-policy';
import { generateRuntimeClientToken } from '../core/runtime-v2-credentials';
import { authenticateRuntimeClientRequest } from './runtime-client-auth';
import { authenticatePipelineApiRequest, generatePipelineApiToken, PipelineApiKeyAuthenticationError } from './pipeline-api-key-service';
import { isRuntimeProtocolConflict } from './runtime-protocol-conflict';

test('runtime JSON body bounds enforce declared length and streamed bytes', async () => {
  const request = (body: string, headers = {}) => new Request('http://local.test', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });
  assert.deepEqual(await readRuntimeBody(request('{"ok":true}')), { ok: true });
  await assert.rejects(readRuntimeBody(request('{}', { 'content-length': '999' }), 20), { code: 'request_too_large', status: 413 });
  await assert.rejects(readRuntimeBody(request(JSON.stringify({ body: 'x'.repeat(100) })), 20), { code: 'request_too_large', status: 413 });
  await assert.rejects(readRuntimeBody(request('{broken')), { code: 'invalid_request', status: 400 });
  await assert.rejects(readRuntimeBody(new Request('http://local.test', { method: 'POST', body: '{}' })), { code: 'invalid_request', status: 415 });
  await assert.rejects(readRuntimeBody(new Request('http://local.test', { method: 'POST', headers: { 'content-type': 'application/json' } })), { code: 'invalid_request', status: 400 });
});
test('runtime idempotency validation rejects missing oversized and control-bearing keys', () => {
  const req = (key: string | null) => ({ headers: { get: () => key } } as unknown as Request);
  assert.equal(runtimeIdempotencyKey(req(' operation-id ')), 'operation-id');
  for (const value of [null, '', 'x'.repeat(256), 'key\u0000suffix', 'key\u007fsuffix']) assert.throws(() => runtimeIdempotencyKey(req(value)), { code: 'invalid_idempotency_key' });
  assert.throws(() => runtimeId('../another-resource'), { code: 'not_found', status: 404 });
});
test('v1 and v2 credential markers never cross-authenticate, without looking up a database', async () => {
  const req = (token: string) => new Request('http://local.test', { headers: { authorization: `Bearer ${token}` } });
  await assert.rejects(authenticateRuntimeClientRequest(req(generatePipelineApiToken())), { code: 'invalid_credential' });
  await assert.rejects(authenticatePipelineApiRequest(req(generateRuntimeClientToken())), PipelineApiKeyAuthenticationError);
  const response = await handleRuntimeV2(req(generatePipelineApiToken()), ['client']);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Bearer realm="runtime-v2"');
});
test('error responses never expose unknown exception text, secrets or stack traces', async () => {
  const result = runtimeError(new Error('secret credential SQL prompt private workspace'));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: { code: 'runtime_unavailable', message: 'Runtime is temporarily unavailable.' } });
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(runtimeError(new RuntimeV2Error('missing_scope', 'Scope required.', 403)).status, 403);
  assert.equal((await runtimeError(new RuntimeCostError('cost_limit_exceeded')).json()).error.code, 'cost_limit_exceeded');
});
test('only the named cross-protocol database guard maps to a cutover conflict', async () => {
  const pgError = { code: '23514', constraint: 'runtime_protocol_idempotency_collision', message: 'private DB context' };
  assert.equal(isRuntimeProtocolConflict({ cause: pgError }), true);
  assert.equal(isRuntimeProtocolConflict({ code: '23514', constraint: 'unrelated' }), false);
  const response = runtimeError({ cause: pgError });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, 'idempotency_protocol_conflict');
  assert.equal(JSON.stringify(body).includes('private DB context'), false);
});
