import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetValidationError, validateImageBytes } from './image-policy';
import { downloadRemoteImage } from './remote-image';
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
