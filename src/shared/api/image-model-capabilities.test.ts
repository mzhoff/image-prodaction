import assert from 'node:assert/strict';
import test from 'node:test';
import { imageCapabilities, normalizeImageCatalog, validateImageSettings, type ImageParameters } from './image-model-capabilities';

const enums = (...values: string[]) => ({ type: 'enum' as const, values });
const model = (id: string, parameters: ImageParameters) => ({
  id, name: id, architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] }, supported_parameters: parameters,
});

test('catalog admits raster models without inventing sizes and excludes vector-only, duplicates and invalid entries', () => {
  const data = normalizeImageCatalog({ data: [
    model('openai/gpt-image-2.5-flare', { quality: enums('low', 'high', 'xhigh', 'max') }),
    model('recraft/vector', { output_format: enums('svg') }),
    model('other/raster', { output_format: enums('png', 'webp'), resolution: enums('2K', '4K') }),
    model('other/raster', {}), model('bad/id/../path', {}), { id: 'malformed' },
  ] });
  assert.deepEqual(data.map((item) => item.id), ['openai/gpt-image-2.5-flare', 'other/raster']);
  assert.deepEqual(data[0].sizes, ['auto']);
  assert.deepEqual(data[1].sizes, ['2K', '4K']);
});

test('settings enforce declared values, model reference limits, format combinations and bounded numbers', () => {
  const capabilities = imageCapabilities({
    aspect_ratio: enums('1:1'), resolution: enums('2K'), quality: enums('high'),
    output_format: enums('png', 'jpeg', 'webp'), background: enums('transparent', 'opaque'),
    input_references: { type: 'range', min: 1, max: 10 }, seed: { type: 'boolean' },
    output_compression: { type: 'range', min: 0, max: 100 },
  });
  const settings = { aspectRatio: '1:1', size: '2K', imageQuality: 'high' as const };
  assert.equal(validateImageSettings(settings, 1, capabilities), undefined);
  assert.match(validateImageSettings(settings, 0, capabilities)!, /от 1 до 4/);
  assert.match(validateImageSettings(settings, 5, capabilities)!, /от 1 до 4/);
  assert.match(validateImageSettings({ ...settings, size: '4K' }, 1, capabilities)!, /resolution/);
  assert.match(validateImageSettings({ ...settings, imageFormat: 'jpeg', imageBackground: 'transparent' }, 1, capabilities)!, /PNG/);
  assert.match(validateImageSettings({ ...settings, imageFormat: 'png', imageCompression: 90 }, 1, capabilities)!, /JPEG/);
  assert.match(validateImageSettings({ ...settings, imageSeed: 1.5 }, 1, capabilities)!, /Некорректные/);
  assert.equal(validateImageSettings({ ...settings, imageSeed: 0, imageCompression: 80, imageFormat: 'webp' }, 1, capabilities), undefined);
});

test('prompt-only models and jpeg-only defaults cannot silently accept unsupported references or transparency', () => {
  const noParameters = imageCapabilities({});
  assert.equal(validateImageSettings({ aspectRatio: 'auto', size: 'auto' }, 0, noParameters), undefined);
  assert.match(validateImageSettings({ aspectRatio: 'auto', size: 'auto' }, 1, noParameters)!, /до 0/);
  assert.match(validateImageSettings({ aspectRatio: 'auto', size: 'auto', imageSeed: 4 }, 0, noParameters)!, /seed/);
  const jpeg = imageCapabilities({ output_format: enums('jpeg'), background: enums('transparent') });
  assert.match(validateImageSettings({ aspectRatio: 'auto', size: 'auto', imageBackground: 'transparent' }, 0, jpeg)!, /PNG/);
});
