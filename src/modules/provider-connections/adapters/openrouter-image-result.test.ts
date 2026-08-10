import assert from 'node:assert/strict';
import test from 'node:test';
import type { RemoteImageDependencies } from '@/shared/storage/remote-image';
import { normalizeOpenRouterImageUrl } from './openrouter-image-result';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('normalizes OpenRouter URLs through the hardened downloader', async () => {
  const dependencies: RemoteImageDependencies = {
    fetch: async () => new Response(onePixelPng, {
      headers: {
        'Content-Length': String(onePixelPng.length),
        'Content-Type': 'image/png',
      },
    }),
    resolveHost: async () => ['93.184.216.34'],
  };
  const normalized = await normalizeOpenRouterImageUrl('https://provider.example/image.png', {
    dependencies,
    maxBytes: 1024,
    timeoutMs: 100,
  });
  assert.equal(normalized, `data:image/png;base64,${onePixelPng.toString('base64')}`);
});
