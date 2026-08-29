import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompositionLayerView } from '../model/composition-model-types.ts';
import { getCompositionRectanglePreviewStyle } from './composition-shape-preview-style.ts';

const style = {
  align: 'left', blendMode: 'normal', blur: 12, color: '#336699', cornerRadius: 24,
  fillOpacity: 50, fit: 'fit', flipX: false, flipY: false, fontFamily: 'Inter',
  fontSize: 64, fontWeight: '700', height: 200, letterSpacing: 0, lineHeight: 72,
  locked: false, opacity: 100, preserveAspectRatio: false, rotation: 0, sizingMode: 'fixed',
  verticalAlign: 'top', visible: true, width: 300, x: 0, y: 0,
  shadow: { blur: 20, color: '#000000', offsetX: -10, offsetY: 8, opacity: 25 },
} satisfies CompositionLayerView['style'];

test('maps rectangle fill and effects into canvas-relative CSS', () => {
  const result = getCompositionRectanglePreviewStyle(style, 1000);

  assert.equal(result.background, 'rgba(51, 102, 153, 0.5)');
  assert.equal(result.borderRadius, '2.4cqw');
  assert.equal(result.filter, 'blur(1.2cqw)');
  assert.equal(result.boxShadow, '-1cqw 0.8cqw 2cqw rgba(0, 0, 0, 0.25)');
});
