import assert from 'node:assert/strict';
import test from 'node:test';
import { intentChatTitle, takeProductionChatTitle } from './production-chat-title';
test('Model title metadata is removed without changing the authored answer', () => {
  assert.deepEqual(takeProductionChatTitle('<production_chat_title>Проморолик кофейни</production_chat_title>\nНачнём со сценария.'), { title: 'Проморолик кофейни', content: 'Начнём со сценария.' });
  assert.deepEqual(takeProductionChatTitle('Обычный ответ'), { title: undefined, content: 'Обычный ответ' });
  assert.equal(takeProductionChatTitle('Пример: <production_chat_title>Текст</production_chat_title>').title, undefined);
  assert.equal(takeProductionChatTitle(`<production_chat_title>${'x'.repeat(121)}</production_chat_title>`).title, undefined);
});
test('Intent title is bounded and works for reference-only turns', () => {
  assert.equal(intentChatTitle('  Создать\n  проморолик  '), 'Создать проморолик');
  assert.equal(intentChatTitle('x'.repeat(200)).length, 90);
  assert.equal(intentChatTitle(''), 'Работа с референсами');
});
