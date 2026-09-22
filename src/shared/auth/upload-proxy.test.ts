import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import nextTesting from 'next/experimental/testing/server.js';

registerHooks({ resolve(specifier, context, next) {
  return next(['next/headers', 'next/navigation', 'next/server'].includes(specifier) ? `${specifier}.js` : specifier, context);
} });
const { config } = await import('../../../proxy');
const { unstable_doesMiddlewareMatch: doesProxyMatch } = nextTesting;
test('streaming upload endpoints bypass the body-cloning proxy, while protected neighboring routes keep it', () => {
  for (const path of ['/api/assets/video', '/api/assets/audio', '/api/assets/images', '/api/projects/123/thumbnail', '/api/chat/v1/references/convert', '/api/telegram/send-post', '/v2/runtime/assets/audio']) {
    assert.equal(doesProxyMatch({ config, url: `http://localhost${path}?query=1` }), false, path);
  }
  for (const path of ['/stories', '/api/assets', '/api/assets/123/content', '/api/projects/123', '/api/stories/timelines/123/jobs', '/api/telegram/other']) {
    assert.equal(doesProxyMatch({ config, url: `http://localhost${path}` }), true, path);
  }
});
