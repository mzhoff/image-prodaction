import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLayerStyle } from './composition-layer-style.ts';

const context = {
  canvasHeight: 1080,
  canvasWidth: 1080,
  index: 0,
  kind: 'image' as const,
};

test('composition layers default to freely resizable proportions', () => {
  const style = normalizeLayerStyle(undefined, context);

  assert.equal(style.preserveAspectRatio, false);
});

test('composition layers preserve an explicit aspect-ratio lock', () => {
  const style = normalizeLayerStyle({ id: 'layer-0', preserveAspectRatio: true }, context);

  assert.equal(style.preserveAspectRatio, true);
});
