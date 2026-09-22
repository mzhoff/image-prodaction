import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversationStarter } from './conversation-start';

test('Drafts perform no requests; concurrent first submits share one start, later sends reuse it', async () => {
  const bodies: Record<string, unknown>[] = [];
  const start = createConversationStarter('workspace', { kind: 'home' }, async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ conversationId: 'home:started' });
  });
  assert.equal(bodies.length, 0);
  await assert.rejects(start({ message: '  ' }), /Добавьте/);
  assert.equal(bodies.length, 0);
  const intent = { message: 'Собери ролик для кофейни' };
  assert.deepEqual(await Promise.all([start(intent), start(intent)]), ['home:started', 'home:started']);
  assert.equal(await start({ message: 'Поправь свет' }), 'home:started');
  assert.equal(bodies.length, 1);
});

test('An uncertain first response retries with the same identity; new drafts get a new identity', async () => {
  const keys: unknown[] = [];
  const request: typeof fetch = async (_url, init) => {
    keys.push(JSON.parse(String(init?.body)).requestId);
    if (keys.length === 1) throw new Error('connection lost after commit');
    return Response.json({ conversationId: 'home:started' });
  };
  const intent = { message: 'Первый запрос' };
  const start = createConversationStarter('workspace', { kind: 'home' }, request);
  await assert.rejects(start(intent));
  assert.equal(await start(intent), 'home:started');
  assert.equal(keys[0], keys[1]);
  await createConversationStarter('workspace', { kind: 'home' }, request)(intent);
  assert.notEqual(keys[1], keys[2]);
});
