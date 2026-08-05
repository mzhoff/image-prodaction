import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { transformPipelineExportImage } from './pipeline-image-operations';

test('server image export applies format, scale and opaque background', async () => {
  const source = await sharp({
    create: {
      background: { alpha: 0.5, b: 30, g: 20, r: 10 },
      channels: 4,
      height: 6,
      width: 8,
    },
  }).png().toBuffer();

  const exported = await transformPipelineExportImage(source, {
    background: 'black',
    format: 'webp',
    quality: 80,
    scale: '0.5',
  });
  const metadata = await sharp(exported.bytes).metadata();

  assert.equal(exported.contentType, 'image/webp');
  assert.equal(exported.extension, 'webp');
  assert.equal(exported.width, 4);
  assert.equal(exported.height, 3);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.hasAlpha, false);
});

test('server JPEG export replaces transparency with white', async () => {
  const source = await sharp({
    create: {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      channels: 4,
      height: 2,
      width: 2,
    },
  }).png().toBuffer();

  const exported = await transformPipelineExportImage(source, {
    background: 'transparent',
    format: 'jpeg',
    quality: 90,
    scale: '1',
  });
  const pixel = await sharp(exported.bytes).raw().toBuffer();

  assert.equal(exported.contentType, 'image/jpeg');
  assert.equal(exported.extension, 'jpg');
  assert.ok(pixel[0]! > 245 && pixel[1]! > 245 && pixel[2]! > 245);
});
