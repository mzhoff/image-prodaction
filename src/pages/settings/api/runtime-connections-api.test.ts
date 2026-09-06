import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeConnectionsApi, RuntimeConnectionsApiError } from './runtime-connections-api';
import { runtimeFixtureClient, runtimeFixtureCredential, runtimeFixtureWorkspace } from '../model/runtime-connections-test-fixtures';

test('connection requests stay same-origin and never attach a service credential', async () => {
  let request: { input: string; init?: RequestInit } | undefined;
  const api = createRuntimeConnectionsApi(async (input, init) => {
    request = { input: String(input), init };
    return Response.json({ clients: [runtimeFixtureClient] });
  });
  const result = await api.listClients(runtimeFixtureWorkspace);
  assert.equal(result.clients[0].id, runtimeFixtureClient.id);
  assert.equal(request?.input, `/api/workspaces/${runtimeFixtureWorkspace}/runtime-connections/clients`);
  assert.equal(request?.init?.cache, 'no-store');
  assert.equal(request?.init?.credentials, 'same-origin');
  assert.equal(request?.init?.redirect, 'error');
  assert.equal(new Headers(request?.init?.headers).has('Authorization'), false);
});

test('raw token is accepted only in the one-time issue response, never key metadata', async () => {
  const token = 'rvr_client_test-one-time-value';
  const api = createRuntimeConnectionsApi(async () => Response.json({ credential: runtimeFixtureCredential, token }));
  const issued = await api.issueCredential(runtimeFixtureWorkspace, runtimeFixtureClient.id, { label: 'Replacement', scopes: null, expiresAt: null });
  assert.equal(issued.token, token);
  const bad = createRuntimeConnectionsApi(async () => Response.json({
    client: runtimeFixtureClient, credentials: [{ ...runtimeFixtureCredential, token }], grants: [],
  }));
  await assert.rejects(() => bad.getClient(runtimeFixtureWorkspace, runtimeFixtureClient.id),
    (error: unknown) => error instanceof RuntimeConnectionsApiError && !error.message.includes(token));
});

test('upstream error text is never shown, even when it echoes a secret', async () => {
  const api = createRuntimeConnectionsApi(async () => Response.json({ error: { code: 'invalid_credential', message: 'rvr_client_do-not-echo' } }, { status: 422 }));
  await assert.rejects(() => api.listClients(runtimeFixtureWorkspace),
    (error: unknown) => error instanceof Error && !error.message.includes('rvr_client'));
});

test('ambiguous test submission retry preserves its idempotency key and exact body', async () => {
  const sent: Array<{ body: string; key: string | null }> = [];
  const api = createRuntimeConnectionsApi(async (_input, init) => {
    sent.push({ body: String(init?.body), key: new Headers(init?.headers).get('Idempotency-Key') });
    throw new TypeError('network interrupted');
  });
  const body = { input: { input: 'same text' }, expectedGrantRevision: 3, maximumProviderCostUsd: '0.01' };
  for (let index = 0; index < 2; index += 1) {
    await assert.rejects(() => api.createRun(runtimeFixtureWorkspace, runtimeFixtureClient.id, 'grant', body, 'retained-key'));
  }
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(sent[0].key, 'retained-key');
});
