import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fingerprintPipelineRunRequest,
  readPipelineMaxAttempts,
} from './pipeline-runtime-run-service';

test('runtime request fingerprint is stable across object key order', () => {
  assert.equal(
    fingerprintPipelineRunRequest({ input: { second: 2, first: 1 }, pipelineId: 'pipeline-1' }),
    fingerprintPipelineRunRequest({ pipelineId: 'pipeline-1', input: { first: 1, second: 2 } }),
  );
});

test('runtime max attempts accepts the safe policy range and defaults otherwise', () => {
  assert.equal(readPipelineMaxAttempts({ maxAttempts: 4 }), 4);
  assert.equal(readPipelineMaxAttempts({ maxAttempts: 0 }), 3);
  assert.equal(readPipelineMaxAttempts({ maxAttempts: 11 }), 3);
  assert.equal(readPipelineMaxAttempts({}), 3);
});
