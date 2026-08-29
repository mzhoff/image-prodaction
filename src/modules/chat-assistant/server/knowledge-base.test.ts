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

test('knowledge search explains executable pipelines with the product metaphor', async () => {
  const result = await searchAssistantKnowledge(
    'что такое Executable Pipelines и для чего они нужны книга рецептов',
    3,
  );

  assert.equal(result.results[0]?.source, 'executable-pipelines.md');
  assert.match(result.results[0]?.excerpt ?? '', /книга рецептов/);
  assert.match(result.results[0]?.excerpt ?? '', /главный повар/);
});

test('knowledge search separates the current runtime API from the planned SDK', async () => {
  const result = await searchAssistantKnowledge(
    'SDK внешний API вызвать pipeline из приложения',
    5,
  );
  const excerpts = result.results
    .filter((entry) => entry.source === 'executable-pipelines.md')
    .map((entry) => entry.excerpt)
    .join('\n');

  assert.match(excerpts, /HTTP Runtime API уже реализован/);
  assert.match(excerpts, /SDK \*\*ещё не выпущен\*\*/);
  assert.match(excerpts, /Token нельзя встраивать в браузерный JavaScript/);
});

test('knowledge search returns the simple editable poster strategy', async () => {
  const result = await searchAssistantKnowledge(
    'редактируемый рекламный макет герой фон QR отдельные слои',
    5,
  );
  const excerpts = result.results
    .filter((entry) => entry.source === 'editable-advertising-layouts.md')
    .map((entry) => entry.excerpt)
    .join('\n');

  assert.match(excerpts, /Герой, фон, текст.*единый основной арт/su);
  assert.match(excerpts, /Функциональный QR всегда создаётся детерминированной нодой/u);

  const contract = await searchAssistantKnowledge(
    'контракт размещения сохранение пропорций градиент',
    5,
  );
  assert.match(
    contract.results
      .filter((entry) => entry.source === 'editable-advertising-layouts.md')
      .map((entry) => entry.excerpt)
      .join('\n'),
    /по умолчанию выключено/u,
  );
});
