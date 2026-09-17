import assert from 'node:assert/strict';
import test from 'node:test';
import { projectMenuPosition } from './project-menu-position';

test('bottom toolbar opens upward, anchored eight pixels from the button', () => {
  const position = projectMenuPosition({ left: 700, right: 880, top: 940, bottom: 978 }, { width: 1440, height: 1000 }, 400);
  assert.equal(position.placement, 'above');
  assert.equal(position.left, 700);
  assert.equal(position.top + 400, 932);
});
test('grid action opens downward when there is enough room', () => {
  const position = projectMenuPosition({ left: 200, right: 200, top: 100, bottom: 100 }, { width: 1440, height: 1000 }, 400);
  assert.equal(position.placement, 'below');
  assert.equal(position.top, 108);
});
test('narrow viewport and long lists remain inside the screen', () => {
  for (const height of [320, 812]) {
    const position = projectMenuPosition({ left: 340, right: 370, top: height - 60, bottom: height - 20 }, { width: 375, height }, 5000);
    assert.equal(position.left, 8);
    assert.equal(position.width, 359);
    assert.ok(position.top >= 8);
    assert.ok(position.top + position.maxHeight <= height - 8);
    assert.ok(position.maxHeight <= 480);
  }
});
