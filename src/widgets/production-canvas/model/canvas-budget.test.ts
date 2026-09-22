import assert from 'node:assert/strict';
import test from 'node:test';
import { readCanvasKeyBudget } from './use-canvas-budget';
import { formatBudgetMoney } from './format-budget-money';

test('only an explicitly unconfigured key is shown as disconnected', async () => {
  const response = (code: string, status = 409) => Response.json({ error: { code } }, { status });
  assert.deepEqual(await readCanvasKeyBudget(response('provider_not_configured')), { status: 'disconnected' });
  for (const [code, status] of [['invalid_credential', 409], ['provider_connection_unavailable', 409], ['forbidden', 403], ['unavailable', 503], ['not_found', 404]] as const) {
    await assert.rejects(readCanvasKeyBudget(response(code, status)));
  }
});

test('unknown, zero and a tiny positive cost are visually distinct', () => {
  assert.equal(formatBudgetMoney(null), '—');
  assert.equal(formatBudgetMoney(undefined), '—');
  assert.equal(formatBudgetMoney(0), '$0.00');
  assert.equal(formatBudgetMoney(5), '$5.00');
  assert.equal(formatBudgetMoney('0.000003'), '< $0.0001');
  assert.equal(formatBudgetMoney('0.0425'), '$0.0425');
});
