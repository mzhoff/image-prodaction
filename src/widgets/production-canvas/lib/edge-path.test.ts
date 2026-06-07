import assert from 'node:assert/strict';
import test from 'node:test';
import { getBezierPath } from './edge-bezier-path.ts';

test('getBezierPath uses a straight segment when ports are nearly aligned horizontally', () => {
  assert.equal(
    getBezierPath({ x: 100, y: 40 }, { x: 112, y: 52 }),
    'M 100 40 L 112 52',
  );
});

test('getBezierPath scales bezier handles from horizontal distance', () => {
  assert.equal(
    getBezierPath({ x: 100, y: 40 }, { x: 140, y: 80 }),
    'M 100 40 C 116.8 40 123.2 80 140 80',
  );
});

test('getBezierPath caps long edge handles', () => {
  assert.equal(
    getBezierPath({ x: 100, y: 40 }, { x: 1100, y: 80 }),
    'M 100 40 C 360 40 840 80 1100 80',
  );
});
