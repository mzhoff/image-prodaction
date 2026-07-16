import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOpenRouterImageUrl } from '@/app/api-routes/ai/openrouter-image-result';
import { AssetValidationError, validateImageBytes } from './image-policy';
import { downloadRemoteImage, RemoteImageError, type RemoteImageDependencies } from './remote-image';
import { createAssetObjectKey } from './s3-assets';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('validates image bytes by signature and returns stable metadata', () => {
  const image = validateImageBytes(onePixelPng, { claimedContentType: 'image/png', maxBytes: 1024 });
  assert.equal(image.contentType, 'image/png');
  assert.equal(image.extension, 'png');
  assert.equal(image.width, 1);
  assert.equal(image.height, 1);
  assert.equal(image.checksumSha256.length, 64);
});

test('rejects spoofed and oversized uploads', () => {
  assert.throws(
    () => validateImageBytes(onePixelPng, { claimedContentType: 'image/jpeg', maxBytes: 1024 }),
    (error: unknown) => error instanceof AssetValidationError && error.code === 'content_type_mismatch',
  );
  assert.throws(
    () => validateImageBytes(onePixelPng, { claimedContentType: 'image/png', maxBytes: 10 }),
    (error: unknown) => error instanceof AssetValidationError && error.code === 'file_too_large',
  );
});

test('reads provider data URLs through the same validation policy', async () => {
  const result = await downloadRemoteImage(`data:image/png;base64,${onePixelPng.toString('base64')}`, {
    maxBytes: 1024,
    timeoutMs: 100,
  });
  assert.equal(result.contentType, 'image/png');
});

test('rejects oversized data URLs before decoding and rejects unsupported declared types', async () => {
  await assert.rejects(
    downloadRemoteImage(`data:image/png;base64,${'A'.repeat(16)}`, { maxBytes: 4, timeoutMs: 100 }),
    (error: unknown) => error instanceof AssetValidationError && error.code === 'file_too_large',
  );
  await assert.rejects(
    downloadRemoteImage(`data:text/plain;base64,${onePixelPng.toString('base64')}`, { maxBytes: 1024, timeoutMs: 100 }),
    (error: unknown) => error instanceof RemoteImageError && error.code === 'unsupported_content_type',
  );
});

test('blocks localhost, metadata IPs, and DNS answers in private ranges before fetch', async () => {
  let fetchCalls = 0;
  const dependencies = createRemoteDependencies({
    fetch: async () => {
      fetchCalls += 1;
      return imageResponse();
    },
    resolveHost: async () => ['10.0.0.10'],
  });

  for (const source of [
    'http://localhost/image.png',
    'http://127.0.0.1/image.png',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/image.png',
    'http://[::ffff:127.0.0.1]/image.png',
    'https://provider.example/image.png',
  ]) {
    await assert.rejects(
      downloadRemoteImage(source, { maxBytes: 1024, timeoutMs: 100 }, dependencies),
      (error: unknown) => error instanceof RemoteImageError && error.code === 'private_address',
    );
  }
  assert.equal(fetchCalls, 0);
});

test('allows public HTTP images, rechecks redirects, and validates response bytes', async () => {
  let fetchCalls = 0;
  const valid = await downloadRemoteImage('http://provider.example/image.png', {
    maxBytes: 1024,
    timeoutMs: 100,
  }, createRemoteDependencies({
    fetch: async () => {
      fetchCalls += 1;
      return imageResponse();
    },
  }));
  assert.equal(valid.contentType, 'image/png');

  await assert.rejects(
    downloadRemoteImage('https://provider.example/redirect', {
      maxBytes: 1024,
      timeoutMs: 100,
    }, createRemoteDependencies({
      fetch: async () => {
        fetchCalls += 1;
        return new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/image.png' } });
      },
    })),
    (error: unknown) => error instanceof RemoteImageError && error.code === 'private_address',
  );
  assert.equal(fetchCalls, 2);
});

test('aborts slow provider downloads with a safe timeout error', async () => {
  await assert.rejects(
    downloadRemoteImage('https://provider.example/slow.png', {
      maxBytes: 1024,
      timeoutMs: 10,
    }, createRemoteDependencies({
      fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('provider socket detail')), { once: true });
      }),
    })),
    (error: unknown) => error instanceof RemoteImageError
      && error.code === 'download_timeout'
      && !error.message.includes('provider socket detail'),
  );
});

test('normalizes OpenRouter URLs through the hardened downloader without changing response format', async () => {
  const normalized = await normalizeOpenRouterImageUrl('https://provider.example/image.png', {
    maxBytes: 1024,
    timeoutMs: 100,
    dependencies: createRemoteDependencies({ fetch: async () => imageResponse() }),
  });
  assert.equal(normalized, `data:image/png;base64,${onePixelPng.toString('base64')}`);
});

test('server owns the bucket key layout', () => {
  assert.equal(
    createAssetObjectKey({
      workspaceId: '01900000-0000-7000-8000-000000000001',
      documentId: '01900000-0000-7000-8000-000000000002',
      assetId: '01900000-0000-7000-8000-000000000003',
      extension: 'PNG',
    }),
    'workspaces/01900000-0000-7000-8000-000000000001/documents/01900000-0000-7000-8000-000000000002/assets/01900000-0000-7000-8000-000000000003.png',
  );
});

function imageResponse() {
  return new Response(onePixelPng, {
    headers: {
      'Content-Length': String(onePixelPng.length),
      'Content-Type': 'image/png',
    },
  });
}

function createRemoteDependencies(
  overrides: Partial<RemoteImageDependencies> = {},
): RemoteImageDependencies {
  return {
    fetch: async () => imageResponse(),
    resolveHost: async () => ['93.184.216.34'],
    ...overrides,
  };
}
