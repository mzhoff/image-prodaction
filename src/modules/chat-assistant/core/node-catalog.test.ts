import assert from 'node:assert/strict';
import test from 'node:test';
import { getAssistantNodeCatalog } from './node-catalog.ts';

test('assistant node catalog is derived from the live product registry', () => {
  const nodes = getAssistantNodeCatalog();
  const prompt = nodes.find((node) => node.type === 'textPrompt');
  const generateImage = nodes.find((node) => node.type === 'generateImage');

  assert.equal(nodes.length, 26);
  assert.ok(prompt?.ports.some((port) => port.id === 'text' && port.side === 'output'));
  assert.ok(generateImage?.ports.some((port) => port.id === 'prompt' && port.kind === 'text'));
  assert.deepEqual(getAssistantNodeCatalog('remove bg').map((node) => node.type), ['removeBackground']);
  assert.equal(getAssistantNodeCatalog('node groups генерация prompt export preview').length, nodes.length);
  assert.equal(getAssistantNodeCatalog('совершенно неизвестная нода').length, nodes.length);
});
