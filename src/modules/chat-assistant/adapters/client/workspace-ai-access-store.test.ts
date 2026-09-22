import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceAiAccessStore, isWorkspaceAiAccessError } from './workspace-ai-access-store';
import type { WorkspaceAiAccess } from './workspace-ai-access';
import { refreshWorkspaceAiAccess } from './workspace-ai-access-refresh';

const connected: WorkspaceAiAccess = { status: 'connected' };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('workspace caches are isolated, concurrent loads dedupe and connected hints expire', async () => {
  let now = 0;
  const calls: string[] = [];
  const pending = deferred<WorkspaceAiAccess>();
  const store = createWorkspaceAiAccessStore({ now: () => now, load: async (id) => { calls.push(id); return pending.promise; } });
  const first = store.load('one'), second = store.load('one');
  assert.equal(first, second);
  assert.equal(store.read('one'), undefined);
  pending.resolve(connected); await first;
  assert.deepEqual(calls, ['one']);
  assert.equal(store.read('two'), undefined);
  await store.load('one'); assert.equal(calls.length, 1);
  now = 60_001;
  await store.load('one'); await store.load('two');
  assert.deepEqual(calls, ['one', 'one', 'two']);
});

test('exact denial codes are remembered and published only to the matching workspace', async () => {
  let calls = 0, notifications = 0;
  const store = createWorkspaceAiAccessStore({ now: () => 0, load: async () => { calls++; return connected; } });
  const unsubscribe = store.subscribe('one', () => notifications++);
  store.subscribe('two', () => assert.fail('another workspace was notified'));
  assert.ok(store.report('one', { error: { code: 'payment_required', message: 'raw provider text' } }));
  assert.equal(store.read('one')?.status, 'budget-exhausted');
  assert.notEqual((store.read('one') as { message: string }).message, 'raw provider text');
  await store.load('one'); assert.equal(calls, 0); assert.equal(notifications, 1);
  unsubscribe(); store.report('one', { code: 'CHAT_MEMBER_AI_DISABLED' });
  assert.equal(notifications, 1); assert.equal(store.read('one')?.status, 'member-disabled');
  assert.equal(isWorkspaceAiAccessError({ descriptor: { code: 'member_budget_exhausted' } }), true);
  for (const error of [new Error('payment_required'), { status: 402 }, { code: 'rate_limited' }, { code: 'CHAT_STREAM_FAILED' }]) {
    assert.equal(isWorkspaceAiAccessError(error), false); assert.equal(store.report('one', error), false);
  }
});

test('a providers response started before explicit denial cannot overwrite it', async () => {
  const pending = deferred<WorkspaceAiAccess>();
  const store = createWorkspaceAiAccessStore({ now: () => 0, load: () => pending.promise });
  const request = store.load('one');
  store.report('one', { code: 'CHAT_WORKSPACE_BUDGET_REQUIRED' });
  pending.resolve(connected);
  assert.equal((await request).status, 'budget-exhausted');
  assert.equal(store.read('one')?.status, 'budget-exhausted');
});

test('explicit refresh supersedes stale pending work, dedupes refresh and may recover access', async () => {
  const first = deferred<WorkspaceAiAccess>(), refresh = deferred<WorkspaceAiAccess>();
  let calls = 0;
  const store = createWorkspaceAiAccessStore({ now: () => 0, load: (_id, previous, force) => {
    calls++;
    if (calls === 1) return first.promise;
    assert.equal(previous?.status, 'member-limit'); assert.equal(force, true); return refresh.promise;
  } });
  const old = store.load('one'); await Promise.resolve();
  store.report('one', { code: 'member_budget_exhausted' });
  const fresh = store.load('one', { force: true });
  assert.equal(fresh, store.load('one', { force: true }));
  refresh.resolve(connected); assert.equal((await fresh).status, 'connected');
  first.resolve({ status: 'not-activated', message: 'old response' }); await old;
  assert.equal(store.read('one')?.status, 'connected'); assert.equal(calls, 2);
});

test('network unknown never fabricates denial or clears the last confirmed snapshot', async () => {
  const store = createWorkspaceAiAccessStore({ now: () => 0, load: async () => { throw new Error('offline'); } });
  await assert.rejects(store.load('one'), /offline/); assert.equal(store.read('one'), undefined);
  store.report('one', { code: 'member_ai_disabled' });
  await assert.rejects(store.load('one', { force: true }), /offline/);
  assert.equal(store.read('one')?.status, 'member-disabled');
});

test('clearing account state invalidates pending responses without restoring another account snapshot', async () => {
  const pending = deferred<WorkspaceAiAccess>();
  const store = createWorkspaceAiAccessStore({ now: () => 0, load: () => pending.promise });
  const request = store.load('one'); store.clear(); pending.resolve(connected);
  await assert.rejects(request, /устарела/); assert.equal(store.read('one'), undefined);
});

test('ordinary connection checks never call usage; explicit budget refresh requires fresh positive remaining budget', async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  let remaining: number | null = 5;
  globalThis.fetch = (async (url) => {
    paths.push(String(url));
    return Response.json(String(url).endsWith('/usage') ? { keyUsage: { limitRemaining: remaining, updatedAt: new Date().toISOString() } }
      : { providers: [{ provider: 'openrouter', status: 'connected' }] });
  }) as typeof fetch;
  try {
    await refreshWorkspaceAiAccess('one', undefined, false);
    assert.deepEqual(paths, ['/api/workspaces/one/providers']);
    const denial: WorkspaceAiAccess = { status: 'budget-exhausted', message: 'known denial' };
    assert.equal((await refreshWorkspaceAiAccess('one', denial, true)).status, 'connected');
    remaining = 0; assert.equal((await refreshWorkspaceAiAccess('one', denial, true)).status, 'budget-exhausted');
    remaining = null; await assert.rejects(refreshWorkspaceAiAccess('one', denial, true), /не означает, что баланс равен нулю/);
    assert.ok(paths.every((path) => path === '/api/workspaces/one/providers' || path === '/api/workspaces/one/providers/openrouter/usage'));
  } finally { globalThis.fetch = originalFetch; }
});

test('member refresh matches the authenticated user, handles policy recovery and uses no upstream usage call', async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  const self = { userId: 'self', enabled: false, limitUsd: '0.10000000', spentUsd: '0.10000000' };
  globalThis.fetch = (async (url) => {
    paths.push(String(url));
    return Response.json(String(url).endsWith('/member-budgets')
      ? { workspaceId: 'one', members: [{ userId: 'other', enabled: true, limitUsd: null }, self] }
      : String(url).endsWith('/get-session') ? { user: { id: 'self' } }
      : { providers: [{ provider: 'openrouter', status: 'connected' }] });
  }) as typeof fetch;
  try {
    const denial: WorkspaceAiAccess = { status: 'member-limit', message: 'known denial' };
    assert.equal((await refreshWorkspaceAiAccess('one', denial, true)).status, 'member-disabled');
    self.enabled = true; assert.equal((await refreshWorkspaceAiAccess('one', denial, true)).status, 'member-limit');
    self.limitUsd = '0.10000001'; assert.equal((await refreshWorkspaceAiAccess('one', denial, true)).status, 'connected');
    self.spentUsd = 'unknown'; await assert.rejects(refreshWorkspaceAiAccess('one', denial, true), /подтвердить/);
    assert.ok(paths.every((path) => !path.endsWith('/usage')));
  } finally { globalThis.fetch = originalFetch; }
});
