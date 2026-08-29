import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompositionLayerView } from './composition-model-types.ts';
import { getCompositionResultSignature } from './composition-signature.ts';

const rectangle = {
  id: 'shape-1',
  index: 2,
  kind: 'rectangle',
  name: 'Rectangle',
  portId: 'shape-1',
  style: {
    align: 'left', blendMode: 'normal', blur: 0, color: '#112233', cornerRadius: 0,
    fillOpacity: 100, fit: 'fit', flipX: false, flipY: false, fontFamily: 'Inter',
    fontSize: 64, fontWeight: '700', height: 200, letterSpacing: 0, lineHeight: 72,
    locked: false, opacity: 100, preserveAspectRatio: false, rotation: 0, sizingMode: 'fixed',
    verticalAlign: 'top', visible: true, width: 300, x: 10, y: 20,
  },
} satisfies CompositionLayerView;

test('rectangle fill and effects invalidate a composed result', () => {
  const signature = (stylePatch: Partial<CompositionLayerView['style']>) => getCompositionResultSignature({
    canvasHeight: 1080,
    canvasWidth: 1080,
    layers: [{ ...rectangle, style: { ...rectangle.style, ...stylePatch } }],
  });
  const baseline = signature({});

  assert.notEqual(signature({ fillOpacity: 40 }), baseline);
  assert.notEqual(signature({ cornerRadius: 24 }), baseline);
  assert.notEqual(signature({ blur: 8 }), baseline);
  assert.notEqual(signature({ shadow: { blur: 20, color: '#000000', offsetX: 0, offsetY: 8, opacity: 25 } }), baseline);
});
