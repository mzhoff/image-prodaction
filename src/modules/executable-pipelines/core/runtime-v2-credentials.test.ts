import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRuntimeCredentialActive, generateRuntimeClientToken, hashRuntimeClientToken, parseRuntimeClientToken, requireRuntimeScope, runtimeClientTokenMatches } from './runtime-v2-credentials';

test('client credentials use independent secret marker and constant-time hash verification', () => {
  const first = generateRuntimeClientToken();
  const second = generateRuntimeClientToken();
  assert.notEqual(first, second);
  assert.ok(parseRuntimeClientToken(first));
  assert.equal(parseRuntimeClientToken(first.replace('rvr_client_', 'rvr_pipe_')), null);
  assert.equal(parseRuntimeClientToken(first.replace(/\.[^.]+$/, '.wrong')), null);
  assert.equal(runtimeClientTokenMatches(first, hashRuntimeClientToken(first)), true);
  assert.equal(runtimeClientTokenMatches(second, hashRuntimeClientToken(first)), false);
  assert.equal(runtimeClientTokenMatches(first, 'broken'), false);
  assert.equal(hashRuntimeClientToken(first).includes(first), false);
});
test('revoked expired and disabled credentials have stable failures', () => {
  const now = new Date('2026-09-05T12:00:00Z');
  for (const [record, code] of [
    [{ enabled: true, revokedAt: now, expiresAt: null }, 'revoked_credential'],
    [{ enabled: true, revokedAt: null, expiresAt: now }, 'expired_credential'],
    [{ enabled: false, revokedAt: null, expiresAt: null }, 'disabled_service_client'],
  ] as const) assert.throws(() => assertRuntimeCredentialActive(record, now), { code });
  assert.doesNotThrow(() => assertRuntimeCredentialActive({ enabled: true, revokedAt: null, expiresAt: null }, now));
});
test('read permission never implies manage/run permission', () => {
  assert.doesNotThrow(() => requireRuntimeScope(['pipeline.catalog.read'], 'pipeline.catalog.read'));
  assert.throws(() => requireRuntimeScope(['pipeline.catalog.read'], 'pipeline.grants.manage'), { code: 'missing_scope' });
  assert.throws(() => requireRuntimeScope(['pipeline.catalog.read'], 'pipeline.run.create'), { code: 'missing_scope' });
});
