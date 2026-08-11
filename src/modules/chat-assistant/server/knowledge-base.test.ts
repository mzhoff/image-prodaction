import assert from 'node:assert/strict';
import test from 'node:test';
import { searchAssistantKnowledge } from './knowledge-base.ts';

test('knowledge search returns bounded excerpts from the product-owned allowlist', async () => {
  const result = await searchAssistantKnowledge('как собрать первый пайплайн', 2);

  assert.equal(result.results.length, 2);
  assert.equal(result.results[0]?.source, 'product-overview.md');
  assert.match(result.results[0]?.excerpt ?? '', /Создайте или откройте документ/);
  assert.ok(result.results.every((entry) => entry.excerpt.length <= 2_400));
});
