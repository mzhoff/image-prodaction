import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { validPlatformSignature } from './request-auth';
test('projection signature binds method, route, exact body and freshness', () => {
  const secret = 's'.repeat(32), timestamp = '1700000000000', body = '{"subject":"one"}';
  const signature = createHmac('sha256', secret).update(`${timestamp}\nPOST\n/v1/platform/budget-connection\n${body}`).digest('hex');
  const input = { body, timestamp, signature, secret, now: Number(timestamp) };
  assert.equal(validPlatformSignature(input), true);
  assert.equal(validPlatformSignature({ ...input, body: '{"subject":"two"}' }), false);
  assert.equal(validPlatformSignature({ ...input, now: input.now + 60_001 }), false);
  assert.equal(validPlatformSignature({ ...input, now: input.now - 60_001 }), false);
  assert.equal(validPlatformSignature({ ...input, signature: 'broken' }), false);
  assert.equal(validPlatformSignature({ ...input, secret: 'other'.repeat(8) }), false);
});
