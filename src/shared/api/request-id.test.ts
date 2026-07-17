import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRequestId } from './request-id';

test('preserves a valid upstream UUID request id', () => {
  const upstream = '019f6dff-f0d3-7b5d-8a2b-772de4dcab29';
  assert.equal(resolveRequestId(` ${upstream} `, () => 'unused'), upstream);
});

test('replaces missing or untrusted request ids', () => {
  assert.equal(resolveRequestId(null, () => 'generated-id'), 'generated-id');
  assert.equal(resolveRequestId('not-a-request-id', () => 'generated-id'), 'generated-id');
  assert.equal(resolveRequestId('value-with\nlog-injection', () => 'generated-id'), 'generated-id');
});
