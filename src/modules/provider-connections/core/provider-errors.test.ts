import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProviderHttpError,
  ProviderTimeoutError,
  classifyProviderError,
  createMissingModalityError,
} from '../index';

const httpCases = [
  [401, 'invalid_credential', 'permanent'],
  [402, 'payment_required', 'permanent'],
  [403, 'forbidden', 'permanent'],
  [408, 'timeout', 'ambiguous'],
  [429, 'rate_limited', 'retryable'],
  [500, 'upstream_unavailable', 'retryable'],
  [502, 'upstream_unavailable', 'retryable'],
  [503, 'upstream_unavailable', 'retryable'],
] as const;

for (const [status, code, classification] of httpCases) {
  test(`classifies provider HTTP ${status} as ${classification}`, () => {
    const result = classifyProviderError(new ProviderHttpError({
      retryAfterMs: status === 429 ? 30_000 : null,
      status,
    }));
    assert.equal(result.code, code);
    assert.equal(result.classification, classification);
    assert.equal(result.httpStatus, status);
    assert.equal(result.retryAfterMs, status === 429 ? 30_000 : null);
  });
}

test('canonical provider error type wins over a lossy HTTP status', () => {
  const result = classifyProviderError(new ProviderHttpError({
    errorType: 'authentication',
    status: 500,
  }));
  assert.equal(result.code, 'invalid_credential');
  assert.equal(result.classification, 'permanent');
});

test('timeout before dispatch is retryable while timeout after dispatch is ambiguous', () => {
  const beforeDispatch = classifyProviderError(new ProviderTimeoutError({
    requestDispatched: false,
  }));
  const afterDispatch = classifyProviderError(new ProviderTimeoutError({
    requestDispatched: true,
  }));
  const withOperationId = classifyProviderError(new ProviderTimeoutError({
    providerOperationId: 'provider-operation-1',
    requestDispatched: false,
  }));

  assert.equal(beforeDispatch.classification, 'retryable');
  assert.equal(afterDispatch.classification, 'ambiguous');
  assert.equal(withOperationId.classification, 'ambiguous');
  assert.equal(withOperationId.providerOperationId, 'provider-operation-1');
});

test('rate limits and upstream failures with an accepted operation are never blindly retried', () => {
  for (const status of [429, 500, 503]) {
    const result = classifyProviderError(new ProviderHttpError({
      providerOperationId: `accepted-${status}`,
      status,
    }));
    assert.equal(result.classification, 'ambiguous');
    assert.equal(result.providerOperationId, `accepted-${status}`);
  }
});

test('missing required modality after an accepted operation requires reconciliation', () => {
  const error = createMissingModalityError({
    actualModalities: ['text'],
    expectedModalities: ['image'],
    providerOperationId: 'provider-operation-2',
  });
  const result = classifyProviderError(error);
  assert.equal(result.code, 'missing_modality');
  assert.equal(result.classification, 'ambiguous');
  assert.equal(result.providerOperationId, 'provider-operation-2');
});
