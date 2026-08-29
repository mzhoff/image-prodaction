import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompositionRenderTextLayer } from './composition-render.ts';
import { getCompositionTextFillStyle } from './composition-render-styles.ts';

const baseTextLayer = {
  align: 'left',
  blendMode: 'normal',
  color: '#ffffff',
  flipX: false,
  flipY: false,
  fontFamily: 'Inter',
  fontSize: 64,
  fontWeight: '700',
  height: 100,
  kind: 'text',
  letterSpacing: 0,
  lineHeight: 72,
  opacity: 100,
  rotation: 0,
  text: 'Gradient',
  verticalAlign: 'top',
  width: 200,
  x: 0,
  y: 0,
} satisfies CompositionRenderTextLayer;

test('canvas text fill falls back to the solid color', () => {
  const context = {} as CanvasRenderingContext2D;

  assert.equal(getCompositionTextFillStyle(context, baseTextLayer), '#ffffff');
});

test('canvas text fill creates a gradient with normalized stops', () => {
  const stops: Array<[number, string]> = [];
  const canvasGradient = {
    addColorStop: (offset: number, color: string) => stops.push([offset, color]),
  } as CanvasGradient;
  const context = {
    createLinearGradient: () => canvasGradient,
  } as unknown as CanvasRenderingContext2D;

  const fill = getCompositionTextFillStyle(context, {
    ...baseTextLayer,
    gradient: {
      angle: 90,
      stops: [
        { color: '#112233', offset: 0, opacity: 25 },
        { color: '#aabbcc', offset: 1, opacity: 100 },
      ],
      type: 'linear',
    },
  });

  assert.equal(fill, canvasGradient);
  assert.deepEqual(stops, [[0, 'rgba(17, 34, 51, 0.25)'], [1, 'rgba(170, 187, 204, 1)']]);
});
