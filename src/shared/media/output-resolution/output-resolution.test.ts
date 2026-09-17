import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createAspectRatioScale, nearestAvailableRatio, parseAspectRatio } from '../aspect-ratio-scale';
import { getImageOutputResolution } from './image-output-resolution';
import { GEMINI_3 } from './image-resolution-tables';
import { getVideoOutputResolution } from './video-output-resolution';
import { normalizeVideoCatalog } from '@/modules/provider-connections/adapters/openrouter-video-catalog';

const snapshot = JSON.parse(readFileSync(new URL('../../../../docs/model-capabilities/openrouter-media-snapshot.json', import.meta.url), 'utf8')) as {
  images: Array<{ id: string; ratios: string[] }>;
  videos: Array<{ id: string; ratios: string[]; resolutions: string[]; sizes: string[] }>;
};
test('common scale covers the whole reviewed catalog, including decimal and panoramic ratios', () => {
  const scale = createAspectRatioScale();
  for (const model of [...snapshot.images, ...snapshot.videos]) for (const ratio of model.ratios) {
    if (ratio !== 'auto') assert.ok(scale.includes(ratio), `${model.id}: ${ratio}`);
  }
  assert.equal(parseAspectRatio('9:19.5'), 9 / 19.5);
  for (const invalid of ['auto', '0:1', '1:0', 'bad', '1:Infinity', '1:-2']) assert.equal(parseAspectRatio(invalid), undefined);
  const expanded = createAspectRatioScale(['5:2']);
  assert.ok(expanded.indexOf('21:9') < expanded.indexOf('5:2') && expanded.indexOf('5:2') < expanded.indexOf('4:1'));
});
test('sparse model snaps only to its supported stops without redistributing positions', () => {
  const scale = createAspectRatioScale(), choices = ['9:16', '16:9'];
  assert.equal(nearestAvailableRatio(scale, choices, 0), '9:16');
  assert.equal(nearestAvailableRatio(scale, choices, 1), '16:9');
  assert.equal(nearestAvailableRatio(scale, choices, scale.indexOf('9:16') / (scale.length - 1)), '9:16');
  assert.equal(nearestAvailableRatio(scale, [], .5), undefined);
});
test('image resolution is model and tier specific, with honest unknowns', () => {
  assert.deepEqual(getImageOutputResolution('google/gemini-2.5-flash-image', '4:5', '1K').pixels, [896, 1152]);
  assert.deepEqual(getImageOutputResolution('google/gemini-3.1-flash-image-preview', '4:5', '1K').pixels, [928, 1152]);
  assert.deepEqual(getImageOutputResolution('google/gemini-3.1-flash-image-preview', '4:5', '2K').pixels, [1856, 2304]);
  assert.deepEqual(getImageOutputResolution('google/gemini-3-pro-image', '9:16', '4K').pixels, [3072, 5504]);
  assert.deepEqual(getImageOutputResolution('google/gemini-3.1-flash-image-preview', '1:8', '0.5K').pixels, [192, 1536]);
  assert.deepEqual(getImageOutputResolution('recraft/recraft-v3', '4:3', 'auto').pixels, [1365, 1024]);
  assert.deepEqual(getImageOutputResolution('recraft/recraft-v4', '4:3', 'auto').pixels, [1216, 896]);
  assert.deepEqual(getImageOutputResolution('recraft/recraft-v4-pro', '4:3', 'auto').pixels, [2432, 1792]);
  for (const args of [
    ['google/gemini-2.5-flash-image', '4:5', '2K'], ['google/gemini-3-pro-image', '1:8', '4K'],
    ['google/gemini-3.1-flash-lite-image', '1:1', '4K'], ['google/gemini-3.1-flash-image', '21:9', '512'],
    ['google/gemini-3.1-flash-image', 'auto', '2K'], ['openai/gpt-5.4-image-2', '4:5', '4K'],
    ['unknown/image', '16:9', '4K'], ['recraft/recraft-v5', '1:1', 'auto'],
  ]) assert.equal(getImageOutputResolution(args[0], args[1], args[2]).pixels, undefined, args.join('/'));
});
test('published image tables have plausible ratios; inconsistent source rows never surface as pixels', () => {
  for (const table of Object.values(GEMINI_3)) for (const [ratio, pixels] of Object.entries(table)) {
    assert.ok(Math.abs(pixels[0] / pixels[1] / parseAspectRatio(ratio)! - 1) < .05, ratio);
  }
});
test('video resolution comes from published sizes, not a universal p conversion', () => {
  const model = (key: string) => ({ key, supportedSizes: snapshot.videos.find((m) => m.id === key)!.sizes });
  assert.deepEqual(getVideoOutputResolution(model('google/veo-3.1'), '9:16', '4K').pixels, [2160, 3840]);
  assert.deepEqual(getVideoOutputResolution(model('bytedance/seedance-2.0'), '1:1', '720p').pixels, [720, 720]);
  assert.deepEqual(getVideoOutputResolution(model('bytedance/seedance-2.5'), '1:1', '720p').pixels, [960, 960]);
  assert.deepEqual(getVideoOutputResolution(model('bytedance/seedance-2.5'), '4:3', '720p').pixels, [1112, 834]);
  assert.deepEqual(getVideoOutputResolution(model('x-ai/grok-imagine-video'), '16:9', '480p').pixels, [854, 480]);
  assert.equal(getVideoOutputResolution(model('bytedance/seedance-2.0'), '9:21', '480p').pixels, undefined);
  assert.equal(getVideoOutputResolution(model('minimax/hailuo-3'), '16:9', '2K').pixels, undefined);
  assert.equal(getVideoOutputResolution({ key: 'bytedance/seedance-2.5', supportedSizes: [] }, '1:1', '720p').pixels, undefined);
  assert.equal(getVideoOutputResolution({ key: 'unknown' }, '16:9', '1080p').pixels, undefined);
});
test('video catalog preserves optional pixel metadata without adding selectable capabilities', () => {
  const [model] = normalizeVideoCatalog({ data: [{ id: 'google/veo-3.1-lite', name: 'Veo',
    supported_durations: [4], supported_resolutions: ['720p'], supported_aspect_ratios: ['16:9'],
    supported_frame_images: [], generate_audio: true, seed: false, supported_sizes: ['1280x720', 'invalid'] }] });
  assert.deepEqual(model.supportedSizes, ['1280x720']);
  assert.deepEqual(model.aspectRatios, ['16:9']);
  assert.deepEqual(model.resolutions, ['720p']);
});
