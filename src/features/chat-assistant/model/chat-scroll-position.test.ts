import assert from 'node:assert/strict';
import test from 'node:test';
import { isChatThreadNearBottom } from './chat-scroll-position.ts';

test('chat considers the exact bottom and the small follow zone near it as current', () => {
  assert.equal(isChatThreadNearBottom({ clientHeight: 600, scrollHeight: 1200, scrollTop: 600 }), true);
  assert.equal(isChatThreadNearBottom({ clientHeight: 600, scrollHeight: 1200, scrollTop: 560 }), true);
});

test('chat stops following when the reader scrolls away from the latest answer', () => {
  assert.equal(isChatThreadNearBottom({ clientHeight: 600, scrollHeight: 1200, scrollTop: 500 }), false);
});
