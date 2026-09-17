import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceGalleryMotion, createGalleryLayout, galleryCardRange, galleryOffset, galleryPosition, projectGalleryCards, type GalleryMotion } from './image-viewer-motion';
import { planGalleryRelease } from './image-viewer-release';

const initial = (phase: GalleryMotion['phase'] = 'coast'): GalleryMotion => ({ ...planGalleryRelease(10.2, 5, 200), phase });
const run = (state: GalleryMotion, seconds: number, hz = 60, count = 200) => {
  for (let i = 0; i < seconds * hz; i++) state = advanceGalleryMotion(state, 1 / hz, count);
  return state;
};

test('release coasts and stops between items without centering', () => {
  const first = run(initial(), 0.1);
  assert.ok(first.position > 10.2);
  assert.ok(first.velocity > 0 && first.velocity < 5);
  const final = run(initial(), 3);
  assert.equal(final.phase, 'idle');
  assert.ok(Math.abs(final.position - (10.2 + 5 / 3)) < 0.001);
  assert.notEqual(final.position, Math.round(final.position));
  assert.deepEqual(run(final, 2), final);
  assert.equal(final.velocity, 0);
});

test('selection travels continuously, including destinations more than three items away', () => {
  for (const target of [15, 199]) {
    const start: GalleryMotion = { position: 10, velocity: 0, target, phase: 'snap' };
    const first = advanceGalleryMotion(start, 1 / 60, 200);
    assert.ok(first.position > 10 && first.position < target);
    assert.equal(run(start, 3).position, target);
    assert.equal(run(start, 3).phase, 'idle');
  }
});

test('main neighbours shrink progressively, pack without overlaps, and remain responsive', () => {
  for (const [width, height] of [[375, 510], [1440, 700], [2560, 1000]]) {
    const layout = createGalleryLayout(Array.from({ length: 200 }, (_, i) => i % 2 ? 9 / 16 : 16 / 9), width!, height!);
    const cards = projectGalleryCards(layout, 100, width!);
    const center = cards.find((card) => card.index === 100)!;
    const near = cards.find((card) => card.index === 101)!;
    const far = cards.find((card) => card.index === 102)!;
    assert.equal(center.center, 0);
    assert.equal(center.scale, 1);
    assert.ok(near.depth < 1 && near.depth > far.depth);
    assert.ok(layout[101]!.height * near.scale < layout[100]!.height);
    assert.ok(layout[102]!.height * far.scale < layout[101]!.height * near.scale);
    assert.ok(near.center - layout[101]!.width * near.scale / 2 < width! / 2);
    assert.ok(cards.length <= 12);
    for (let i = 1; i < cards.length; i++) {
      const prev = cards[i - 1]!; const next = cards[i]!;
      assert.ok(prev.center + layout[prev.index]!.width * prev.scale / 2 < next.center - layout[next.index]!.width * next.scale / 2);
    }
    // Crossing an index must not jump the packed track or change a card's size.
    const before = projectGalleryCards(layout, 99.99999, width!).find((card) => card.index === 100)!;
    const after = projectGalleryCards(layout, 100.00001, width!).find((card) => card.index === 100)!;
    assert.ok(Math.abs(before.center - after.center) < 0.1);
    assert.ok(Math.abs(before.scale - after.scale) < 0.001);
  }
});

test('press braking is smooth, stronger than coasting, and does not reverse direction', () => {
  const coast = run(initial(), 0.1);
  const brake = run(initial('brake'), 0.1);
  assert.ok(brake.position > 10.2);
  assert.ok(brake.position < coast.position);
  assert.ok(brake.velocity > 0 && brake.velocity < coast.velocity);
  assert.equal(run(initial('brake'), 3).phase, 'idle');
  assert.notEqual(run(initial('brake'), 3).position, Math.round(run(initial('brake'), 3).position));
});

test('motion is refresh-rate independent and bounded at both library edges', () => {
  assert.ok(Math.abs(run(initial(), 0.2, 60).position - run(initial(), 0.2, 120).position) < 1e-8);
  for (const [position, velocity] of [[0.1, -6], [198.9, 6], [0, 4]]) {
    let state = planGalleryRelease(position!, velocity!, position === 0 ? 1 : 200);
    for (let i = 0; i < 240; i++) {
      state = advanceGalleryMotion(state, 1 / 60, position === 0 ? 1 : 200);
      assert.ok(state.position >= 0 && state.position <= (position === 0 ? 0 : 199));
    }
    assert.equal(state.phase, 'idle');
  }
});

test('mixed aspect ratios fit the viewport and index/pixel positions round-trip', () => {
  const layout = createGalleryLayout([16 / 9, 9 / 16, 1, 50, NaN], 1440, 700);
  const centers = layout.map((card) => card.center);
  for (const card of layout) {
    assert.ok(card.width <= 1440 * 0.78);
    assert.ok(card.height <= 700);
  }
  for (let i = 0; i <= 4; i += 0.125) assert.ok(Math.abs(galleryPosition(centers, galleryOffset(centers, i)) - i) < 1e-10);
  assert.equal(galleryPosition(centers, -1000), 0);
  assert.equal(galleryPosition(centers, 100_000), 4);
  assert.equal(galleryPosition([], 1), 0);
});

test('every rendered card has a placement at both edges and every fractional position', () => {
  assert.deepEqual(galleryCardRange(0, 0), { start: 0, end: -1 });
  for (const count of [1, 2, 6, 9, 20, 200]) {
    const layout = createGalleryLayout(Array.from({ length: count }, (_, i) => i % 2 ? 9 / 16 : 16 / 9), 1440, 740);
    for (let position = 0; position <= count - 1; position += 0.125) {
      const range = galleryCardRange(count, Math.round(position));
      const indices = Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i);
      const cards = projectGalleryCards(layout, position, 1440);
      assert.deepEqual(cards.map((card) => card.index), indices);
      assert.ok(cards.length <= 9);
      assert.ok(cards.every((card) => Number.isFinite(card.center) && card.scale > 0));
    }
  }
});
