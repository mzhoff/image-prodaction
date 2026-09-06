import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRuntimeVersions, normalizeRuntimePipelineReference } from './runtime-v2-versions';

const base = { checksum: 'a'.repeat(64), inputSchemaChecksum: 'b'.repeat(64), outputSchemaChecksum: 'c'.repeat(64), capabilityKey: 'content.summary', semantic: { input: null, output: null } };
test('pipeline links are parsed without fetching and reject secret-bearing/ambiguous links', () => {
  const id = 'pln_019fb9e98e757364b4c34ca908554584';
  assert.equal(normalizeRuntimePipelineReference(` ${id} `), id);
  assert.equal(normalizeRuntimePipelineReference(`http://localhost:3004/v1/pipelines/${id}`), id);
  for (const url of [`http://user:secret@localhost/pipelines/${id}`, `https://host/pipelines/${id}?token=secret`, `file:///pipelines/${id}`, `https://host/unknown/${id}`]) assert.throws(() => normalizeRuntimePipelineReference(url), { code: 'invalid_pipeline_reference' });
});
test('schema equality cannot automatically approve unknown behavior or provider cost', () => {
  const actual = compareRuntimeVersions({ pinned: base, candidate: { ...base, checksum: 'd'.repeat(64) }, updatePolicy: 'AUTO_COMPATIBLE' });
  assert.equal(actual.structural, 'COMPATIBLE');
  assert.equal(actual.behavioralChange, true);
  assert.equal(actual.autoRepinAllowed, false);
  assert.deepEqual(actual.autoRepinDeniedReasons, ['behavioral_release_gate_unavailable', 'cost_compatibility_unproven']);
});
test('breaking capability fields and semantic contract are denied independently', () => {
  for (const candidate of [{ ...base, capabilityKey: 'other.capability' }, { ...base, inputSchemaChecksum: 'd'.repeat(64) }, { ...base, outputSchemaChecksum: 'e'.repeat(64) }, { ...base, semantic: { input: { contractVersion: '2' }, output: null } }]) {
    const result = compareRuntimeVersions({ pinned: base, candidate, updatePolicy: 'AUTO_COMPATIBLE' });
    assert.equal(result.structural, 'INCOMPATIBLE');
    assert.equal(result.autoRepinAllowed, false);
  }
});
test('missing historical contract evidence is unknown and PINNED always manual', () => {
  assert.equal(compareRuntimeVersions({ pinned: { ...base, inputSchemaChecksum: null }, candidate: base, updatePolicy: 'PINNED' }).structural, 'UNKNOWN');
  const result = compareRuntimeVersions({ pinned: base, candidate: base, updatePolicy: 'PINNED' });
  assert.equal(result.autoRepinAllowed, false);
  assert.ok(result.autoRepinDeniedReasons.includes('manual_update_policy'));
});
