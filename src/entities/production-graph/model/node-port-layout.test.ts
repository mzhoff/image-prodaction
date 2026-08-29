import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node.ts';
import { getPortTop } from './node-port-layout.ts';

test('QR Code input port aligns its center with the content field top edge', () => {
  const node = createDefaultNode('qrCode', { x: 0, y: 0 });

  assert.equal(getPortTop(node, 'input', 0), 66);
});
