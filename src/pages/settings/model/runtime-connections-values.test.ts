import assert from 'node:assert/strict';
import test from 'node:test';
import { canPinRuntimeVersion, resolveCatalogReference, runtimeRepinInput } from './runtime-connections-values';
import { createRuntimeTestAttempt, initialRuntimeTestInput, runtimeArtifactPath } from './runtime-grant-test-values';
import { runtimeFixtureGrant, runtimeFixturePipeline, runtimeFixtureVersion } from './runtime-connections-test-fixtures';

test('resolves only a published same-workspace catalog item without fetching a pasted URL', () => {
  const catalog = [runtimeFixturePipeline];
  assert.equal(resolveCatalogReference(runtimeFixturePipeline.publicId, catalog)?.publicId, runtimeFixturePipeline.publicId);
  assert.equal(resolveCatalogReference(`https://example.test/v2/pipelines/${runtimeFixturePipeline.publicId}`, catalog)?.publicId, runtimeFixturePipeline.publicId);
  assert.equal(resolveCatalogReference(`https://user:secret@example.test/${runtimeFixturePipeline.publicId}`, catalog), null);
  assert.equal(resolveCatalogReference(`file:///${runtimeFixturePipeline.publicId}`, catalog), null);
  assert.equal(resolveCatalogReference(`https://example.test/${runtimeFixturePipeline.publicId}/${runtimeFixturePipeline.publicId}`, catalog), null);
  assert.equal(resolveCatalogReference(`pln_${'b'.repeat(32)}`, catalog), null);
});

test('a missing capability or checksum cannot create a pinned grant', () => {
  assert.equal(canPinRuntimeVersion(runtimeFixtureVersion), true);
  assert.equal(canPinRuntimeVersion({ ...runtimeFixtureVersion, capabilityKey: null }), false);
  assert.equal(canPinRuntimeVersion({ ...runtimeFixtureVersion, inputSchemaChecksum: null }), false);
  assert.throws(() => runtimeRepinInput(3, { ...runtimeFixtureVersion, capabilityKey: null }));
  assert.deepEqual(runtimeRepinInput(3, runtimeFixtureVersion), {
    expectedGrantRevision: 3, version: 2, checksum: 'a'.repeat(64),
    inputSchemaChecksum: 'b'.repeat(64), outputSchemaChecksum: 'c'.repeat(64),
  });
});

test('test submission fixes revision, decimal cap and JSON input in one retained attempt', () => {
  const attempt = createRuntimeTestAttempt(runtimeFixtureGrant, '{"input":"First input"}', '0.00500000', 'stable-key');
  assert.equal(attempt.key, 'stable-key');
  assert.deepEqual(attempt.request, {
    expectedGrantRevision: 3, input: { input: 'First input' }, maximumProviderCostUsd: '0.00500000',
  });
  assert.throws(() => createRuntimeTestAttempt(runtimeFixtureGrant, '{"input":123}', '', 'key'));
  assert.throws(() => createRuntimeTestAttempt(runtimeFixtureGrant, '{"unknown":"value"}', '', 'key'));
  assert.throws(() => createRuntimeTestAttempt(runtimeFixtureGrant, '[]', '', 'key'));
  assert.throws(() => createRuntimeTestAttempt(runtimeFixtureGrant, '{"input":"text"}', '0,5', 'key'));
  assert.deepEqual(JSON.parse(initialRuntimeTestInput(runtimeFixtureGrant)), { input: '' });
});

test('artifact preview builds a session route from an asset id, rejecting URLs and traversal', () => {
  const asset = '019abcde-1234-7000-8000-000000000005';
  assert.equal(runtimeArtifactPath('workspace', 'client', 'run', asset), `/api/workspaces/workspace/runtime-connections/clients/client/runs/run/artifacts/${asset}`);
  assert.equal(runtimeArtifactPath('workspace', 'client', 'run', '../../secret'), null);
  assert.equal(runtimeArtifactPath('workspace', 'client', 'run', 'https://attacker.test/image.png'), null);
});
