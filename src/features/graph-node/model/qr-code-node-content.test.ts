import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveQrCodeEffectiveContent } from './qr-code-node-content.ts';

test('connected QR input has priority even when its value is empty or whitespace', () => {
  assert.equal(resolveQrCodeEffectiveContent({
    hasIncomingEdge: true,
    incomingText: '   ',
    localContent: 'https://local.example/fallback',
  }), '');
  assert.equal(resolveQrCodeEffectiveContent({
    hasIncomingEdge: true,
    localContent: 'https://local.example/fallback',
  }), '');
});

test('QR local content is used only when the text input has no incoming edge', () => {
  assert.equal(resolveQrCodeEffectiveContent({
    hasIncomingEdge: false,
    localContent: '  https://local.example/fallback  ',
  }), 'https://local.example/fallback');
});
