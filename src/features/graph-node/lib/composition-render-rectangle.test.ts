import assert from 'node:assert/strict';
import test from 'node:test';
import { drawCompositionRectangle } from './composition-render-rectangle.ts';
import type { CompositionRenderRectangleLayer } from './composition-render-types.ts';

test('draws a rounded rectangle with independent shadow and fill opacity', () => {
  const calls: string[] = [];
  const context = {
    beginPath: () => calls.push('begin'), closePath: () => calls.push('close'),
    clip: (rule: string) => calls.push(`clip:${rule}`), fill: () => calls.push('fill'),
    globalAlpha: 1, lineTo: () => calls.push('line'), moveTo: () => calls.push('move'),
    quadraticCurveTo: () => calls.push('curve'), rect: () => calls.push('rect'),
    restore: () => calls.push('restore'), save: () => calls.push('save'),
  } as unknown as CanvasRenderingContext2D;
  const layer = {
    blendMode: 'normal', blur: 6, color: '#336699', cornerRadius: 24, fillOpacity: 45,
    flipX: false, flipY: false, height: 160, kind: 'rectangle', opacity: 100,
    rotation: 0, shadow: { blur: 20, color: '#000000', offsetX: -4, offsetY: 8, opacity: 30 },
    width: 280, x: 0, y: 0,
  } satisfies CompositionRenderRectangleLayer;

  drawCompositionRectangle(context, layer);

  assert.equal(context.filter, 'blur(6px)');
  assert.equal(context.shadowColor, 'rgba(0, 0, 0, 0.3)');
  assert.equal(context.globalAlpha, 0.45);
  assert.ok(calls.includes('clip:evenodd'));
  assert.equal(calls.filter((call) => call === 'fill').length, 2);
  assert.ok(calls.includes('curve'));
});
