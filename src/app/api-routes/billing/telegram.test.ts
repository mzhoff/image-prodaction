import assert from 'node:assert/strict';
import test from 'node:test';
import { handleTelegramHandoff } from './telegram';
const data = { requestId: '33333333-3333-4333-8333-333333333333', workspaceId: '11111111-1111-4111-8111-111111111111', plan: 'creator', amountUsd: 25 };
const request = (body: unknown = data, origin = 'https://production.test') => new Request('https://production.test/api/billing/telegram', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('only authenticated same-origin requests with bounded choices reach Identity', async () => {
  const calls: unknown[] = [];
  const ports = { origins: () => ['https://production.test'], session: async () => ({ user: { id: 'current-user' } }), send: async (id: string, input: unknown) => { calls.push({ id, input }); return { telegramUrl: 'https://t.me/test_bot', id: 'handoff' }; } };
  assert.equal((await handleTelegramHandoff(request(data, 'https://foreign.test'), ports)).status, 403);
  assert.equal((await handleTelegramHandoff(request(), { ...ports, session: async () => null })).status, 401);
  for (const patch of [{ subject: 'victim' }, { amountUsd: 250 }, { plan: 'admin' }]) assert.equal((await handleTelegramHandoff(request({ ...data, ...patch }), ports)).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await handleTelegramHandoff(request(), ports)).status, 200);
  assert.deepEqual(calls, [{ id: 'current-user', input: data }]);
  for (const amountUsd of [10, 75, 100, 200]) assert.equal((await handleTelegramHandoff(request({ ...data, amountUsd }), ports)).status, 200);
  for (const amountUsd of [9, 201, 25.5]) assert.equal((await handleTelegramHandoff(request({ ...data, amountUsd }), ports)).status, 400);
});
test('handoff failures offer a next action without exposing internal errors', async () => {
  const ports = { origins: () => ['https://production.test'], session: async () => ({ user: { id: 'u' } }), send: async () => { throw Object.assign(new Error('private upstream detail'), { code: 'HANDOFF_ALREADY_PENDING', status: 409 }); } };
  const result = await handleTelegramHandoff(request(), ports);
  assert.equal(result.status, 409);
  const body = await result.text();
  assert.match(body, /отмените/); assert.doesNotMatch(body, /private upstream/);
});
