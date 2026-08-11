import assert from 'node:assert/strict';
import test from 'node:test';
import { imageProductionKnowledgeTools } from './image-production-tools.ts';

test('assistant tool names are compatible with OpenAI-compatible providers', () => {
  const names = imageProductionKnowledgeTools.map((tool) => tool.name);

  assert.equal(new Set(names).size, names.length);
  for (const name of names) {
    assert.match(name, /^[a-zA-Z0-9_-]+$/);
  }
});
