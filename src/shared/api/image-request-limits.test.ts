import assert from 'node:assert/strict';
import test from 'node:test';
import { GEMINI_INLINE_REQUEST_MAX_BYTES as limit, getGeminiInlineRequestSizeError } from './image-request-limits';

test('counts complete serialized inline request bytes with exact boundary and UTF-8', () => {
  const model = 'google/gemini-3.1-flash-image-preview';
  const prefix = '{"url":"data:image/png;base64,';
  const exact = prefix + 'A'.repeat(limit - prefix.length - 2) + '"}';
  assert.equal(getGeminiInlineRequestSizeError(model, exact), null);
  assert.match(getGeminiInlineRequestSizeError(model, exact + ' ')!, /20 МБ.*base64/);
  assert.notEqual(getGeminiInlineRequestSizeError(model, exact.slice(0, -1) + 'я'), null);
});

test('does not invent a global OpenRouter cap or confuse text/URL references with inline media', () => {
  const padding = 'x'.repeat(limit);
  assert.equal(getGeminiInlineRequestSizeError('other/image', '{"url":"data:image/png;base64,' + padding), null);
  assert.equal(getGeminiInlineRequestSizeError('google/gemini-test', JSON.stringify({ text: '"url":"data:image/png;base64,' + padding })), null);
  assert.equal(getGeminiInlineRequestSizeError('google/gemini-test', JSON.stringify({ url: 'https://example.test/a.png', text: padding })), null);
});
