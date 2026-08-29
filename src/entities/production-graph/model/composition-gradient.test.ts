import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultCompositionGradient,
  getCompositionGradientLine,
  normalizeCompositionGradient,
  toCssCompositionGradient,
} from './composition-gradient.ts';

test('normalizes a linear gradient and clamps ordered stops', () => {
  const gradient = normalizeCompositionGradient({
    angle: -45,
    stops: [
      { color: '#FFFFFF', offset: 1.4, opacity: 120 },
      { color: '#123456', offset: -0.2, opacity: 35 },
      { color: 'not-a-color', offset: 0.5 },
    ],
    type: 'linear',
  });

  assert.deepEqual(gradient, {
    angle: 315,
    stops: [
      { color: '#123456', offset: 0, opacity: 35 },
      { color: '#ffffff', offset: 1, opacity: 100 },
    ],
    type: 'linear',
  });
});

test('creates a useful default and serializes it for the browser preview', () => {
  const gradient = createDefaultCompositionGradient('#336699');

  assert.equal(
    toCssCompositionGradient(gradient),
    'linear-gradient(90deg, rgba(51, 102, 153, 1) 0%, rgba(0, 0, 0, 1) 100%)',
  );
});

test('maps CSS gradient angles to canvas coordinates', () => {
  assert.deepEqual(getCompositionGradientLine(200, 100, 90), {
    startX: 0,
    startY: 50,
    endX: 200,
    endY: 50,
  });

  const vertical = getCompositionGradientLine(200, 100, 0);
  assert.ok(Math.abs(vertical.startX - 100) < 0.000001);
  assert.ok(Math.abs(vertical.startY - 100) < 0.000001);
  assert.ok(Math.abs(vertical.endX - 100) < 0.000001);
  assert.ok(Math.abs(vertical.endY) < 0.000001);
});
