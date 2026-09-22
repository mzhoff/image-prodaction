import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { convertHeicReference, HEIC_REFERENCE_MAX_BYTES } from './heic-reference';
test('HEIC decoder rejects oversized and unrelated data before decoding', async () => {
  await assert.rejects(convertHeicReference(new Uint8Array()), /8 МБ/);
  await assert.rejects(convertHeicReference(new Uint8Array(HEIC_REFERENCE_MAX_BYTES + 1)), /8 МБ/);
  await assert.rejects(convertHeicReference(Buffer.from('not an image')), /не HEIC/);
  await assert.rejects(convertHeicReference(Buffer.from('0000ftypbroken')), /HEIC/);
});
test('Real HEIC becomes a bounded browser-readable WebP without source metadata', { skip: !process.env.HEIC_TEST_FILE }, async () => {
  const result = await convertHeicReference(await readFile(process.env.HEIC_TEST_FILE!));
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'webp'); assert.ok(metadata.width <= 2048 && metadata.height <= 2048); assert.equal(metadata.exif, undefined);
});
