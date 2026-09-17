import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelPreferenceStore } from './preference-store';
import { emptyAccountModelPreferences, applyModelPreferenceChange, type ModelPreferenceChange } from '@/shared/model-preferences/contracts';
const settle = async (store: ModelPreferenceStore) => { while (store.getSnapshot().pending) await new Promise((resolve) => setTimeout(resolve, 1)); };
test('shared cache serializes rapid tab changes, preserves favorites, and uses the originating account precondition', async () => {
  const remote = emptyAccountModelPreferences('alice');
  remote.preferences.image.favorites = ['p/existing'];
  const seen: string[] = [];
  const transport = (async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('x-account-id'), 'alice');
    if (init?.method !== 'PATCH') return Response.json(remote);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const change = JSON.parse(init.body as string) as ModelPreferenceChange;
    seen.push(change.action);
    remote.preferences[change.modality] = applyModelPreferenceChange(remote.preferences[change.modality], change);
    remote.preferences[change.modality].revision++;
    return Response.json({ accountId: 'alice', preference: remote.preferences[change.modality] });
  }) as typeof fetch;
  const store = new ModelPreferenceStore('alice', transport);
  await store.refresh();
  store.change({ modality: 'image', action: 'tab', tab: 'popular' });
  store.change({ modality: 'image', action: 'tab', tab: 'favorites' });
  assert.equal(store.getSnapshot().data.preferences.image.tab, 'favorites');
  await settle(store);
  assert.equal(store.getSnapshot().data.preferences.image.tab, 'favorites');
  assert.deepEqual(store.getSnapshot().data.preferences.image.favorites, ['p/existing']);
  assert.equal(store.getSnapshot().data.preferences.video.tab, 'all');
  assert.deepEqual(seen, ['tab', 'tab']);
});
test('failed favorite save rolls back optimistically displayed data and reports failure', async () => {
  const store = new ModelPreferenceStore('alice', (async (_url, init) => init?.method === 'PATCH'
    ? Response.json({ error: { message: 'Offline. Repeat the action.' } }, { status: 503 })
    : Response.json(emptyAccountModelPreferences('alice'))) as typeof fetch);
  await store.refresh();
  store.change({ modality: 'audio', action: 'favorite', modelId: 'p/voice', favorite: true });
  assert.deepEqual(store.getSnapshot().data.preferences.audio.favorites, ['p/voice']);
  await settle(store);
  assert.deepEqual(store.getSnapshot().data.preferences.audio.favorites, []);
  assert.match(store.getSnapshot().error, /Offline/);
});
test('responses from another login never populate the account cache', async () => {
  const store = new ModelPreferenceStore('alice', (async () => Response.json(emptyAccountModelPreferences('bob'))) as typeof fetch);
  await store.refresh();
  assert.equal(store.getSnapshot().ready, false);
  assert.equal(store.getSnapshot().data.accountId, 'alice');
  assert.match(store.getSnapshot().error, /Аккаунт изменился/);
});

test('a synchronously failing transport can be retried and does not leave a permanently cached rejected read', async () => {
  let attempt = 0;
  const store = new ModelPreferenceStore('alice', (() => {
    if (++attempt === 1) throw new Error('transport temporarily unavailable');
    return Promise.resolve(Response.json(emptyAccountModelPreferences('alice')));
  }) as typeof fetch);
  await store.refresh(); assert.equal(store.getSnapshot().ready, false);
  await store.refresh(); assert.equal(store.getSnapshot().ready, true);
  assert.equal(attempt, 2);
});
