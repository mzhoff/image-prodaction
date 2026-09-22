import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInitialInterfaceLocale } from './interface-locale-preference';

test('saved interface locale takes precedence over browser language', () => {
  assert.equal(resolveInitialInterfaceLocale('ru', 'en-US,en;q=0.9'), 'ru');
  assert.equal(resolveInitialInterfaceLocale('en', 'ru-RU,ru;q=0.9'), 'en');
});

test('first visit uses Russian only for a Russian primary browser language', () => {
  assert.equal(resolveInitialInterfaceLocale(null, 'ru-RU,ru;q=0.9,en;q=0.8'), 'ru');
  assert.equal(resolveInitialInterfaceLocale(undefined, 'ru'), 'ru');
  assert.equal(resolveInitialInterfaceLocale(null, 'en-US,en;q=0.9,ru;q=0.8'), 'en');
  assert.equal(resolveInitialInterfaceLocale(null, 'de-DE,de;q=0.9'), 'en');
  assert.equal(resolveInitialInterfaceLocale(null, null), 'en');
});
