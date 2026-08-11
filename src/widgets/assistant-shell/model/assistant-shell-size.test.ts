import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampAssistantShellSize,
  resizeAssistantShell,
} from './assistant-shell-size.ts';

test('assistant shell size stays inside product and viewport bounds', () => {
  assert.deepEqual(
    clampAssistantShellSize({ height: 2_000, width: 2_000 }, { height: 1_000, width: 1_200 }),
    { height: 900, width: 880 },
  );
  assert.deepEqual(
    clampAssistantShellSize({ height: 100, width: 100 }, { height: 800, width: 1_000 }),
    { height: 420, width: 360 },
  );
});

test('dragging the top-left resize handle grows the anchored shell', () => {
  assert.deepEqual(
    resizeAssistantShell(
      { height: 650, width: 420 },
      { x: -120, y: -80 },
      'top-left',
      { height: 1_000, width: 1_200 },
    ),
    { height: 730, width: 540 },
  );
});

test('small viewports override the desktop minimum without overflowing', () => {
  assert.deepEqual(
    clampAssistantShellSize({ height: 650, width: 420 }, { height: 430, width: 390 }),
    { height: 386, width: 346 },
  );
});
