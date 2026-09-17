import { expect, test } from '@playwright/test';
import { createAudioQaOwner } from './audio-runtime-fixtures';
import { IMAGE_GENERATION_REQUEST_MAX_BYTES } from '../src/shared/api/image-request-limits';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ retries: 0 });

test('large image JSON reaches validation through Next and optional Visual Intent proxy without a paid call', async ({ baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:3004');
  const origins = [origin.origin, ...(process.env.IMAGE_QA_PROXY_URL ? [new URL(process.env.IMAGE_QA_PROXY_URL).origin] : [])];
  for (const value of origins) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Transport QA is local-only.');
  }
  const owner = await createAudioQaOwner(origin.origin, 'image-transport');
  const cookie = owner.http.browserSessionCookies().map(({ name, value }) => `${name}=${value}`).join('; ');
  // Intentionally invalid documentId: every accepted JSON body fails schema before
  // credential resolution, enqueue or provider dispatch, even on a real local stack.
  const makeBody = (bytes: number) => {
    const base = { padding: '', documentId: 'transport-probe-invalid', workspaceId: owner.workspaceId };
    return JSON.stringify({ ...base, padding: 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify(base))) });
  };
  try {
    for (const target of origins) {
      for (const bytes of [15 * 1024 * 1024, IMAGE_GENERATION_REQUEST_MAX_BYTES, IMAGE_GENERATION_REQUEST_MAX_BYTES + 1]) {
        const body = makeBody(bytes);
        expect(Buffer.byteLength(body)).toBe(bytes);
        const response = await fetch(`${target}/api/ai/generate-image`, {
          method: 'POST', body, signal: AbortSignal.timeout(30_000), redirect: 'manual',
          headers: { 'content-type': 'application/json', origin: target, cookie },
        });
        const result = await response.json();
        if (bytes > IMAGE_GENERATION_REQUEST_MAX_BYTES) {
          expect(response.status).toBe(413);
          expect(result.error.code).toBe('generation_request_too_large');
        } else {
          expect(response.status).toBe(400);
          expect(result.error.formErrors).toEqual([]);
          expect(result.error.fieldErrors.documentId.length).toBeGreaterThan(0);
          expect(result.error.fieldErrors.workspaceId).toBeUndefined();
        }
      }
    }
  } finally {
    await owner.http.request('/api/auth/sign-out', { json: {} });
  }
});
