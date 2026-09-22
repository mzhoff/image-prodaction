import assert from 'node:assert/strict';
import { test } from 'node:test';
import { englishMessages, intlLocale, translateMessage } from './translate';
import { localizeUiCatalog } from './localize-ui-catalog';

test('every catalog entry has English copy and the same interpolation parameters', () => {
  assert.ok(Object.keys(englishMessages).length > 2900);
  const params = (s: string) => [...s.matchAll(/\{p\d+\}/g)].map((m) => m[0]).sort();
  for (const [source, translated] of Object.entries(englishMessages)) {
    assert.ok(translated.trim(), source);
    assert.deepEqual(params(translated), params(source), source);
  }
});

test('language switching translates UI copy and leaves parameter values intact', () => {
  const name = 'Мой {p2} проект $&';
  assert.equal(translateMessage('en', 'Открыть {p1}', { p1: name }), `Open ${name}`);
  assert.equal(translateMessage('ru', 'Открыть {p1}', { p1: name }), `Открыть ${name}`);
  assert.equal(translateMessage('en', 'Открыть {p1}'), 'Open {p1}');
  assert.equal(translateMessage('en', 'Delete'), 'Delete');
  assert.equal(intlLocale('en'), 'en-US');
  assert.equal(intlLocale('ru'), 'ru-RU');
});

test('known validation templates match the complete message and preserve captured data', () => {
  assert.equal(translateMessage('en', 'Открыть изображение 42'), 'Open image 42');
  assert.equal(translateMessage('en', 'Моя заметка: Открыть изображение 42'), 'Моя заметка: Открыть изображение 42');
  assert.equal(translateMessage('en', 'Неизвестная техническая ошибка XYZ'), 'Неизвестная техническая ошибка XYZ');
});

test('static option catalogs translate labels without changing IDs, prompts or content', () => {
  const action = () => 'Сохранить';
  const catalog = [{ id: 'Сохранить', value: 'Сохранить', label: 'Сохранить', name: 'Имя', content: 'Сохранить', prompt: 'Сохранить', action }];
  const result = localizeUiCatalog(catalog, (s, params) => translateMessage('en', s, params));
  assert.equal(result[0].label, 'Save');
  assert.equal(result[0].id, catalog[0].id);
  assert.equal(result[0].value, catalog[0].value);
  assert.equal(result[0].name, catalog[0].name);
  assert.equal(result[0].content, catalog[0].content);
  assert.equal(result[0].prompt, catalog[0].prompt);
  assert.equal(result[0].action, action);
  assert.equal(catalog[0].label, 'Сохранить');
});
