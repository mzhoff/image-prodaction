import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getCanvasWheelZoomMultiplier, useCanvasNavigation } from './use-canvas-navigation';

function InitialZoom({ value }: { value: number }) {
  const { zoom } = useCanvasNavigation({ initialZoom: value });
  return createElement('span', null, zoom);
}

test('canvas initialization clamps legacy zoom to 135% without changing values within bounds', () => {
  for (const [value, expected] of [[2.4, 1.35], [1.35, 1.35], [1.2, 1.2], [0.58, 0.58], [0.01, 0.1]]) {
    assert.equal(renderToStaticMarkup(createElement(InitialZoom, { value })), `<span>${expected}</span>`);
  }
});

test('touchpad pinch gets 5x sensitivity while mouse wheel and physical Ctrl keep their speed', () => {
  assert.equal(getCanvasWheelZoomMultiplier({ ctrlKey: true, deltaMode: 0 }, false), 5);
  assert.equal(getCanvasWheelZoomMultiplier({ ctrlKey: true, deltaMode: 0 }, true), 1);
  assert.equal(getCanvasWheelZoomMultiplier({ ctrlKey: false, deltaMode: 0 }, false), 1);
  assert.equal(getCanvasWheelZoomMultiplier({ ctrlKey: true, deltaMode: 1 }, false), 1);
  assert.equal(getCanvasWheelZoomMultiplier({ ctrlKey: true, deltaMode: 2 }, false), 1);
});
