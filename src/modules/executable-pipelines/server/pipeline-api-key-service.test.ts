import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generatePipelineApiToken,
  hashPipelineApiToken,
  parsePipelineApiToken,
} from './pipeline-api-key-service';

test('pipeline API token is high-entropy, parseable and stored only as a hash', () => {
  const first = generatePipelineApiToken();
  const second = generatePipelineApiToken();

  assert.notEqual(first, second);
  assert.match(first, /^rvr_pipe_[A-Za-z0-9_-]{12}\.[A-Za-z0-9_-]{43}$/);
  assert.ok(parsePipelineApiToken(first));
  assert.match(hashPipelineApiToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashPipelineApiToken(first).includes(first), false);
});

test('pipeline API token parser rejects tampered lookup prefixes', () => {
  const token = generatePipelineApiToken();
  assert.equal(parsePipelineApiToken(token.replace('rvr_pipe_', 'rvr_pipe_A')), null);
  assert.equal(parsePipelineApiToken('Bearer token'), null);
});
