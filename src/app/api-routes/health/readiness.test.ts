import assert from 'node:assert/strict';
import test from 'node:test';
import { getReadiness } from './readiness';

test('reports ready only when PostgreSQL and private object storage are reachable', async () => {
  const response = await getReadiness({
    checkDatabase: async () => undefined,
    checkObjectStorage: async () => undefined,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ready',
    checks: { database: 'ok', objectStorage: 'ok' },
  });
});

test('reports safe per-dependency statuses without exposing provider errors', async () => {
  const secretDetail = 'postgres://user:secret@internal/database';
  const response = await getReadiness({
    checkDatabase: async () => undefined,
    checkObjectStorage: async () => {
      throw new Error(secretDetail);
    },
  });
  const serialized = JSON.stringify(await response.json());

  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(serialized), {
    status: 'not_ready',
    checks: { database: 'ok', objectStorage: 'failed' },
  });
  assert.equal(serialized.includes(secretDetail), false);
});
