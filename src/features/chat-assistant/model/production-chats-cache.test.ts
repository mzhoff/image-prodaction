import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductionChatsCache, type ChatListScope } from './production-chats-cache';
import type { ProductionChatSummary } from '@/modules/chat-assistant/contracts/production-chats';

const scope: ChatListScope = { workspaceId: 'one', status: 'active', query: '', paged: true };
const chat = (id: number): ProductionChatSummary => ({ id: String(id), title: `Chat ${id}`, status: 'active', folderId: null, kind: 'home', href: '/', updatedAt: '', messageCount: 1 });
const rows = (start: number, count: number) => Array.from({ length: count }, (_, i) => chat(start + i));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

test('concurrent readers share a request; reopening a collapsed list reuses the complete cache', async () => {
  const calls: number[] = [];
  const store = createProductionChatsCache(async (_scope, offset, limit) => {
    calls.push(offset); return { items: rows(offset, limit), hasMore: true };
  });
  const unsubscribe = store.subscribe(scope, () => {});
  const first = store.load(scope); assert.equal(first, store.load(scope));
  await first; await store.loadMore(scope);
  unsubscribe();
  const subscribeAgain = store.subscribe({ ...scope }, () => {});
  await store.load({ ...scope });
  assert.deepEqual(calls, [0, 5]);
  assert.equal(store.read(scope).items.length, 15);
  await store.loadMore(scope);
  assert.deepEqual(calls, [0, 5, 15]);
  subscribeAgain();
});

test('workspace, folder, status, search and page size have independent cached snapshots', async () => {
  let calls = 0;
  const store = createProductionChatsCache(async () => ({ items: [chat(++calls)], hasMore: false }));
  const scopes = [scope, { ...scope, workspaceId: 'two' }, { ...scope, folderId: 'folder' },
    { ...scope, status: 'archived' }, { ...scope, status: 'deleted' }, { ...scope, query: 'video' }, { ...scope, paged: false }];
  for (const item of scopes) await store.load(item);
  for (const item of scopes) await store.load(item);
  assert.equal(calls, scopes.length);
  assert.equal(new Set(scopes.map((item) => store.read(item).items[0].id)).size, scopes.length);
  const anotherUser = createProductionChatsCache();
  assert.equal(anotherUser.read(scope).items.length, 0);
});

test('empty results are cached and do not request another page', async () => {
  let calls = 0;
  const store = createProductionChatsCache(async () => { calls++; return { items: [], hasMore: false }; });
  await store.load(scope); await store.load(scope); await store.loadMore(scope);
  assert.equal(calls, 1); assert.equal(store.read(scope).loaded, true);
});

test('next-page failure preserves visible data and retries the same offset without duplicate rows', async () => {
  let fail = true;
  const offsets: number[] = [];
  const store = createProductionChatsCache(async (_scope, offset) => {
    offsets.push(offset);
    if (offset && fail) throw Error('offline');
    return { items: offset ? rows(4, 10) : rows(0, 5), hasMore: true };
  });
  await store.load(scope); await store.loadMore(scope);
  assert.equal(store.read(scope).items.length, 5); assert.equal(store.read(scope).offset, 5);
  assert.ok(store.read(scope).error);
  fail = false; await store.loadMore(scope);
  assert.deepEqual(offsets, [0, 5, 5]);
  assert.equal(store.read(scope).items.length, 14);
  assert.equal(store.read(scope).offset, 15);
  assert.equal(store.read(scope).error, '');
});

test('a mutation refreshes the loaded window; collapsed scopes stay cached until next opened', async () => {
  const calls: [string, number, number][] = [];
  const store = createProductionChatsCache(async (current, offset, limit) => {
    calls.push([current.workspaceId, offset, limit]); return { items: rows(offset, limit), hasMore: true };
  });
  const other = { ...scope, workspaceId: 'two' };
  await store.load(scope); await store.loadMore(scope); await store.load(other);
  store.invalidate('one');
  assert.equal(calls.length, 3);
  assert.equal(store.read(scope).items.length, 15);
  await store.load(scope); await store.load(other);
  assert.deepEqual(calls.at(-1), ['one', 0, 15]);
  assert.equal(calls.length, 4);
  store.subscribe(scope, () => {}); store.invalidate('one'); await store.load(scope);
  assert.equal(calls.length, 5); assert.equal(store.read(scope).items.length, 15);
});

test('a response from before a mutation cannot overwrite refreshed data', async () => {
  const oldPage = deferred<{ items: ProductionChatSummary[]; hasMore: boolean }>();
  let calls = 0;
  const store = createProductionChatsCache(async () => ++calls === 1 ? oldPage.promise : { items: [chat(99)], hasMore: false });
  store.subscribe(scope, () => {});
  const first = store.load(scope); await Promise.resolve();
  store.invalidate('one'); await store.load(scope);
  oldPage.resolve({ items: [chat(1)], hasMore: true }); await first;
  assert.deepEqual(store.read(scope).items.map((item) => item.id), ['99']);
  assert.equal(store.read(scope).loading, false);
});
