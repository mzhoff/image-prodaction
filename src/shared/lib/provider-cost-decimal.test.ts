import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProviderCostUsd } from './provider-cost-decimal';

test('provider monetary strings retain exact ledger precision even beyond JS safe integer cents', () => {
  assert.equal(normalizeProviderCostUsd('999999999999.12345678'), '999999999999.12345678');
  assert.equal(normalizeProviderCostUsd('0.000000015'), '0.00000002');
  assert.equal(normalizeProviderCostUsd('1.230000000'), '1.23');
  assert.equal(normalizeProviderCostUsd('0'), '0');
  assert.equal(normalizeProviderCostUsd('0.000000001'), null);
  for (const invalid of [null, 'NaN', '1e-8', '-1', '1000000000000']) {
    assert.equal(normalizeProviderCostUsd(invalid), null);
  }
});
