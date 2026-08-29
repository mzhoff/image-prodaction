import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPOSITION_CANVAS_DIMENSION_MAX,
  COMPOSITION_CANVAS_DIMENSION_MIN,
  compositionCanvasPresetGroups,
  compositionCanvasPresets,
  getCompositionCanvasPreset,
  getCompositionCanvasPresetId,
  normalizeCompositionCanvasDimension,
} from './composition-canvas-presets.ts';
import { getCompositionCanvasSize, getCompositionSizeSelection } from './composition-options.ts';

test('canvas presets cover every requested format group with safe unique dimensions', () => {
  assert.deepEqual(new Set(compositionCanvasPresets.map((preset) => preset.group)), new Set(compositionCanvasPresetGroups));
  assert.equal(new Set(compositionCanvasPresets.map((preset) => preset.id)).size, compositionCanvasPresets.length);
  compositionCanvasPresets.forEach((preset) => {
    assert.equal(Number.isInteger(preset.width), true);
    assert.equal(Number.isInteger(preset.height), true);
    assert.ok(preset.width >= COMPOSITION_CANVAS_DIMENSION_MIN && preset.width <= COMPOSITION_CANVAS_DIMENSION_MAX);
    assert.ok(preset.height >= COMPOSITION_CANVAS_DIMENSION_MIN && preset.height <= COMPOSITION_CANVAS_DIMENSION_MAX);
  });
});

test('canvas preset lookup resolves known formats and treats arbitrary dimensions as custom', () => {
  assert.deepEqual(getCompositionCanvasPreset('print-a4-portrait'), {
    id: 'print-a4-portrait',
    group: 'Print',
    label: 'A4 portrait · 300 DPI · 2480 × 3508',
    width: 2480,
    height: 3508,
    aspectRatio: 'custom',
  });
  assert.equal(getCompositionCanvasPresetId(1152, 2048), 'story-2k');
  assert.equal(getCompositionCanvasPresetId(1377, 2049), 'custom');
});

test('manual canvas dimensions are rounded and bounded without changing valid exact values', () => {
  assert.equal(normalizeCompositionCanvasDimension(1377, 1080), 1377);
  assert.equal(normalizeCompositionCanvasDimension(100, 1080), COMPOSITION_CANVAS_DIMENSION_MIN);
  assert.equal(normalizeCompositionCanvasDimension(9000, 1080), COMPOSITION_CANVAS_DIMENSION_MAX);
  assert.equal(normalizeCompositionCanvasDimension(Number.NaN, 1080), 1080);
});

test('custom canvas dimensions stay visible instead of falling back to a false 1K label', () => {
  const selection = getCompositionSizeSelection('custom', 1377, 2049);

  assert.equal(selection.selectedSize, 'custom');
  assert.deepEqual(selection.sizeOptions.at(-1), {
    value: 'custom',
    label: 'Custom · 1377 × 2049',
  });
  assert.equal(getCompositionSizeSelection('unknown', 1377, 2049).selectedSize, '1K');
});

test('legacy 2K story sizing remains 1152 by 2048', () => {
  assert.deepEqual(getCompositionCanvasSize('9:16', '2K', 9 / 16), { width: 1152, height: 2048 });
});
