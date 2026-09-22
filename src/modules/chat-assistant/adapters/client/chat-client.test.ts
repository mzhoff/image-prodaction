import assert from 'node:assert/strict';
import test from 'node:test';
import { RestSseChatClient } from '@prodactionpro/chat-sdk';
import type { ChatTurnRequest } from '@prodactionpro/chat-domain';
import { createImageProductionChatClient } from './chat-client';

test('A document transport binds only on Send and preserves the submitted context', async (t) => {
  let starts = 0;
  const submitted: ChatTurnRequest[] = [];
  t.mock.method(globalThis, 'fetch', async () => {
    starts++; return Response.json({ conversationId: 'document:canonical' });
  });
  const accepted = new Error('fake gateway received the turn');
  t.mock.method(RestSseChatClient.prototype, 'streamTurn', async (payload: ChatTurnRequest) => {
    submitted.push(payload); throw accepted;
  });
  const client = createImageProductionChatClient('workspace', { kind: 'flow', id: 'document' });
  assert.equal(starts, 0, 'opening a host must not create a chat');
  const context = { route: '/projects/document', document: { id: 'document', revision: '4' } };
  const turn: ChatTurnRequest = { message: 'Собери Flow для предметной съёмки', mode: 'product-copilot', model: 'fake', context };
  await assert.rejects(client.streamTurn(turn), (error) => error === accepted);
  await assert.rejects(client.streamTurn(turn), (error) => error === accepted);
  assert.equal(starts, 1);
  assert.equal(submitted[0].conversationId, 'document:canonical');
  assert.deepEqual(submitted[0].context, context);
  assert.equal(submitted[1].conversationId, submitted[0].conversationId);
  await assert.rejects(client.streamTurn({ ...turn, conversationId: 'document:restored' }), (error) => error === accepted);
  assert.equal(starts, 1, 'restored history does not create a replacement conversation');
  assert.equal(submitted[2].conversationId, 'document:restored');
});

test('a deferred document is persisted before the first conversation, and only on Send', async (t) => {
  const order: string[] = [];
  t.mock.method(globalThis, 'fetch', async () => { order.push('conversation'); return Response.json({ conversationId: 'story:canonical' }); });
  t.mock.method(RestSseChatClient.prototype, 'createTurn', async () => { order.push('turn'); throw new Error('gateway'); });
  const client = createImageProductionChatClient('workspace', { kind: 'story', id: 'draft' }, async () => { order.push('document'); });
  assert.deepEqual(order, []);
  await assert.rejects(client.createTurn({ message: 'Напиши историю', model: 'fake', mode: 'general-chat' }), /gateway/);
  assert.deepEqual(order, ['document', 'conversation', 'turn']);
  await assert.rejects(client.createTurn({ message: 'Продолжай', model: 'fake', mode: 'general-chat', conversationId: 'story:canonical' }), /gateway/);
  assert.deepEqual(order, ['document', 'conversation', 'turn', 'turn']);
});
test('a failed document save cannot leave an orphan conversation', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({}); });
  const client = createImageProductionChatClient('workspace', { kind: 'timeline', id: 'draft' }, async () => { throw new Error('offline'); });
  await assert.rejects(client.streamTurn({ message: 'Помоги с монтажом', model: 'fake', mode: 'general-chat' }), /offline/);
  assert.equal(calls, 0);
});
