import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { optimizeReferenceImage } from './reference-image-optimizer';

const dataUrl = (buffer: Buffer, type = 'png') => `data:image/${type};base64,${buffer.toString('base64')}`;
const decode = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

test('lossless WebP reduces a large PNG without changing dimensions, pixels or source', async () => {
  const source = await sharp({ create: { width: 2400, height: 1800, channels: 4, background: { r: 21, g: 92, b: 180, alpha: 0.5 } } })
    .png({ compressionLevel: 0 }).toBuffer();
  const original = dataUrl(source);
  const result = await optimizeReferenceImage(original);
  assert.match(result, /^data:image\/webp;base64,/);
  assert.ok(result.length < original.length);
  const output = decode(result);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 2400);
  assert.equal(metadata.height, 1800);
  assert.equal(metadata.hasAlpha, true);
  assert.deepEqual(await sharp(output).raw().toBuffer(), await sharp(source).raw().toBuffer());
  assert.equal(original, dataUrl(source));
});

test('retains a smaller original, existing WebP, animation, URLs and unsupported bytes', async () => {
  const source = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  const url = dataUrl(source);
  const candidate = await sharp(source).keepMetadata().webp({ lossless: true, effort: 3 }).toBuffer();
  assert.ok(candidate.length > source.length);
  assert.equal(await optimizeReferenceImage(url), url);
  for (const value of ['https://private.example/image.png', 'data:image/webp;base64,AAAA', 'data:image/gif;base64,AAAA', 'data:image/png;base64,not-an-image']) {
    assert.equal(await optimizeReferenceImage(value), value);
  }
});

test('does not narrow 16-bit PNG or out-of-range dimensions to fit WebP', async () => {
  const highBit = await sharp({ create: { width: 80, height: 80, channels: 3, background: 'red' } })
    .toColourspace('rgb16').png().toBuffer();
  assert.equal((await sharp(highBit).metadata()).depth, 'ushort');
  const wide = await sharp({ create: { width: 16384, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  for (const source of [highBit, wide]) assert.equal(await optimizeReferenceImage(dataUrl(source)), dataUrl(source));
});
