import assert from 'node:assert/strict';
import test from 'node:test';
import { cutIntersectsSegment } from './cut-intersection';

test('scissors catch crossing, touching and collinear strokes but reject nearby misses', () => {
  const a = { x: 0, y: 0 }, b = { x: 100, y: 100 };
  assert.equal(cutIntersectsSegment(a, b, { x: 0, y: 100 }, { x: 100, y: 0 }), true);
  assert.equal(cutIntersectsSegment(a, b, b, { x: 150, y: 20 }), true);
  assert.equal(cutIntersectsSegment(a, b, { x: 20, y: 20 }, { x: 80, y: 80 }), true);
  assert.equal(cutIntersectsSegment(a, b, { x: 110, y: 110 }, { x: 200, y: 200 }), false);
  assert.equal(cutIntersectsSegment(a, { x: 100, y: 0 }, { x: 0, y: 8 }, { x: 100, y: 8 }), false);
  assert.equal(cutIntersectsSegment(a, { x: 100, y: 0 }, { x: 50, y: 1 }, { x: 80, y: 1 }), true);
});
