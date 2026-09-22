import assert from 'node:assert/strict';
import test from 'node:test';
import { BUDGET_PACKAGES, PRODUCTION_PLANS, parsePublicBillingConfig, topUpRubles } from './catalog';

test('public billing configuration fails closed and strips unrelated secret fields', () => {
  assert.deepEqual(parsePublicBillingConfig(null), { transfer: null, telegramBotUrl: null });
  assert.deepEqual(parsePublicBillingConfig({ telegramBotUsername: '@reverie_local_test_bot', secret: 'not-public', transfer: { rubPerUsd: 100 } }), {
    telegramBotUrl: 'https://t.me/reverie_local_test_bot', transfer: null,
  });
  for (const username of ['https://evil.example/bot', 'javascript:bot', 'a'.repeat(40) + 'bot']) assert.equal(parsePublicBillingConfig({ telegramBotUsername: username }).telegramBotUrl, null);
});

test('partial and invalid rates never produce bank transfer instructions', () => {
  const transfer = { recipient: 'ИП', bank: 'Банк', details: 'Реквизиты', purpose: 'AI-бюджет', rubPerUsd: 97.35 };
  assert.deepEqual(parsePublicBillingConfig({ transfer }).transfer, transfer);
  for (const rate of [0, -1, Infinity, NaN, '100', 97.351]) assert.equal(parsePublicBillingConfig({ transfer: { ...transfer, rubPerUsd: rate } }).transfer, null);
  assert.equal(parsePublicBillingConfig({ transfer: { ...transfer, details: '' } }).transfer, null);
});

test('packages quote whole dollars at the approved rate without coupling them to a plan', () => {
  assert.deepEqual(BUDGET_PACKAGES, [10, 25, 50, 100]);
  assert.deepEqual(BUDGET_PACKAGES.map((amount) => topUpRubles(amount, 97.35)), [973.5, 2433.75, 4867.5, 9735]);
  assert.equal(topUpRubles(75, 97.35), 7301.25);
  assert.equal(topUpRubles(200, 100), 20000);
  for (const amount of [9, 201, NaN, 10.5]) assert.throws(() => topUpRubles(amount, 100));
  assert.throws(() => topUpRubles(10, 0));
  assert.throws(() => topUpRubles(10, NaN));
});

test('Community stays on every tier; reuse export starts at Creator; integration is Studio only', () => {
  assert.ok(PRODUCTION_PLANS.every((plan) => plan.features.includes('Публикация рецептов в Community')));
  assert.deepEqual(PRODUCTION_PLANS.filter((plan) => plan.export).map((plan) => plan.id), ['creator', 'studio']);
  assert.deepEqual(PRODUCTION_PLANS.filter((plan) => plan.integration).map((plan) => plan.id), ['studio']);
});
