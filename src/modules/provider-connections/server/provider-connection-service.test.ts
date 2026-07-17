import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProviderAdapterError,
  type ProviderErrorCode,
} from '@/modules/provider-connections';
import { shouldInvalidateProviderConnection } from './provider-connection-service';

test('only a permanent invalid credential disables a saved connection', () => {
  assert.equal(shouldInvalidateProviderConnection(error(
    'permanent',
    'invalid_credential',
  )), true);
  assert.equal(shouldInvalidateProviderConnection(error(
    'retryable',
    'upstream_unavailable',
  )), false);
  assert.equal(shouldInvalidateProviderConnection(error(
    'retryable',
    'rate_limited',
  )), false);
  assert.equal(shouldInvalidateProviderConnection(error(
    'permanent',
    'payment_required',
  )), false);
});

function error(
  classification: 'ambiguous' | 'permanent' | 'retryable',
  code: ProviderErrorCode,
) {
  return new ProviderAdapterError({
    classification,
    code,
    httpStatus: null,
    message: 'safe fixture',
    providerOperationId: null,
    retryAfterMs: null,
  });
}
