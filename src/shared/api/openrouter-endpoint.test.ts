import assert from 'node:assert/strict';
import test from 'node:test';
import { getOpenRouterBaseUrl } from './openrouter-endpoint';

test('OpenRouter transport defaults to the provider and accepts the private SSH gateway', () => {
  assert.equal(getOpenRouterBaseUrl({}), 'https://openrouter.ai/api/v1');
  assert.equal(getOpenRouterBaseUrl({ OPENROUTER_BASE_URL: 'http://172.30.89.1:3188/openrouter/api/v1/' }),
    'http://172.30.89.1:3188/openrouter/api/v1');
  for (const value of ['http://example.com/api/v1', 'http://10.evil.example', 'https://secret@example.com', 'https://example.com?token=secret', 'ftp://example.com']) {
    assert.throws(() => getOpenRouterBaseUrl({ OPENROUTER_BASE_URL: value }), /OPENROUTER_BASE_URL/);
  }
});
