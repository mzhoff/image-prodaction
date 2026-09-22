import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import { TimelineAutosave } from './timeline-autosave';
import { browserTimelineDraftStore, type LocalTimelineDraft, type TimelineDraftStore } from './timeline-local-draft';

const original = (): TimelineDocument => ({ id: randomUUID(), workspaceId: randomUUID(), folderId: null, storyboardId: null, name: 'Montage', revision: 1, createdAt: '', updatedAt: '', snapshot: { schemaVersion: 1, aspectRatio: '16:9', clips: [] } });
function setup() {
  let local: LocalTimelineDraft | null = null, server = original();
  const calls: TimelineDocument[] = [];
  const store: TimelineDraftStore = { read: () => local, write: (value) => { local = structuredClone(value); } };
  const save = async (value: TimelineDocument) => { calls.push(value); server = { ...value, revision: value.revision + 1 }; return server; };
  const controller = new TimelineAutosave({ store, save, load: async () => server, delay: 60_000 }); controller.initialize(server); controller.stop();
  return { controller, calls, store, save, get local() { return local!; }, get server() { return server; } };
}
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

test('every edit is journaled immediately, sync retains undo/redo and unchanged snapshots do not write', async () => {
  const x = setup(), c = x.controller;
  c.edit({ ...x.server, name: 'Edited' }); assert.equal(x.local.draft.name, 'Edited'); assert.equal(x.calls.length, 0);
  await c.flush(); assert.equal(c.getSnapshot().dirty, false); assert.equal(c.getSnapshot().canUndo, true);
  c.undo(); assert.equal(c.getSnapshot().draft?.name, 'Montage'); await c.flush();
  c.redo(); await c.flush(); assert.equal(x.server.name, 'Edited');
  const count = x.calls.length; c.edit(c.getSnapshot().draft!); await c.flush(); assert.equal(x.calls.length, count);
});
test('edits made during slow requests are serialized against the next revision without disabling editing', async () => {
  const x = setup(), pending = deferred<TimelineDocument>(), calls: TimelineDocument[] = [];
  const c = new TimelineAutosave({ store: x.store, load: async () => x.server, save: (doc) => { calls.push(doc); return calls.length === 1 ? pending.promise : Promise.resolve({ ...doc, revision: doc.revision + 1 }); } });
  c.initialize(x.server); c.stop(); c.edit({ ...x.server, name: 'First' }); const flushing = c.flush(); await Promise.resolve();
  c.edit({ ...c.getSnapshot().draft!, name: 'Second' }); assert.equal(x.local.draft.name, 'Second');
  pending.resolve({ ...calls[0], revision: 2 }); const saved = await flushing;
  assert.deepEqual(calls.map((doc) => [doc.name, doc.revision]), [['First', 1], ['Second', 2]]);
  assert.equal(saved.name, 'Second'); assert.equal(saved.revision, 3); assert.equal(x.local.draft.name, 'Second');
});
test('offline changes survive reopening, sync failure retains them and retry succeeds', async () => {
  const x = setup(); x.controller.edit({ ...x.server, name: 'Offline' });
  let online = false;
  const c = new TimelineAutosave({ store: x.store, load: async () => x.server, save: async (doc) => { if (!online) throw new TypeError('Offline'); return x.save(doc); } });
  c.initialize(x.server); c.stop(); assert.equal(c.getSnapshot().draft?.name, 'Offline');
  await assert.rejects(c.flush()); assert.equal(x.local.draft.name, 'Offline'); assert.equal(c.getSnapshot().dirty, true);
  online = true; await c.flush(); assert.equal(x.server.name, 'Offline'); assert.equal(c.getSnapshot().error, '');
});
test('a lost acknowledgement is recovered without overwriting newer local edits', async () => {
  const x = setup(), accepted = { ...x.server, name: 'First', revision: 2 };
  let calls = 0;
  const c = new TimelineAutosave({ store: x.store, load: async () => accepted, save: async (doc) => { if (++calls === 1) throw Object.assign(new Error('CAS'), { status: 409 }); return { ...doc, revision: doc.revision + 1 }; } });
  c.initialize(x.server); c.stop(); c.edit({ ...x.server, name: 'First' }); await c.flush();
  assert.equal(c.getSnapshot().conflict, false); assert.equal(c.getSnapshot().draft?.revision, 2); assert.equal(calls, 1);
  const recovered = new TimelineAutosave({ store: x.store, load: async () => accepted, save: x.save }); recovered.initialize(accepted); recovered.stop();
  assert.equal(recovered.getSnapshot().dirty, false);
});
test('other-tab conflicts preserve the journal until explicit local or server resolution', async () => {
  const x = setup(); x.controller.edit({ ...x.server, name: 'Local' });
  const remote = { ...x.server, name: 'Other tab', revision: 3 }; const revisions: number[] = [];
  const c = new TimelineAutosave({ store: x.store, load: async () => remote, save: async (doc) => { revisions.push(doc.revision); return { ...doc, revision: doc.revision + 1 }; } });
  c.initialize(remote); c.stop(); assert.equal(c.getSnapshot().conflict, true); assert.equal(x.local.draft.name, 'Local');
  await assert.rejects(c.flush()); assert.equal(revisions.length, 0);
  c.resolve('local'); await c.flush(); assert.deepEqual(revisions, [3]); assert.equal(c.getSnapshot().draft?.name, 'Local');
  const d = new TimelineAutosave({ store: x.store, load: async () => remote, save: x.save });
  d.initialize({ ...remote, revision: 5 }, { version: 1, base: x.server, draft: { ...x.server, name: 'Keep as undo' }, savedAt: 1 }); d.stop();
  d.resolve('server'); assert.equal(d.getSnapshot().draft?.name, 'Other tab'); d.undo(); assert.equal(d.getSnapshot().draft?.name, 'Keep as undo');
});
test('invalid intermediate input stays local; correcting it permits sync', async () => {
  const x = setup(); x.controller.edit({ ...x.server, name: '' }); assert.equal(x.local.draft.name, '');
  await assert.rejects(x.controller.flush()); assert.equal(x.calls.length, 0);
  x.controller.edit({ ...x.controller.getSnapshot().draft!, name: 'Valid' }); await x.controller.flush(); assert.equal(x.server.name, 'Valid');
});
test('local storage failure is visible and does not prevent server sync', async () => {
  const x = setup(); const c = new TimelineAutosave({ store: { read: () => null, write: () => { throw new Error('Quota'); } }, save: x.save, load: async () => x.server });
  c.initialize(x.server); c.stop(); c.edit({ ...x.server, name: 'Remote fallback' }); assert.ok(c.getSnapshot().localError); await c.flush(); assert.equal(c.getSnapshot().dirty, false);
});
test('browser journals are isolated by account and transfer recovery only after a successful write', () => {
  const values = new Map<string, string>(); const storage = { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null, getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const doc = original(), record: LocalTimelineDraft = { version: 1, base: doc, draft: { ...doc, name: 'Recovered' }, savedAt: 1 };
    const first = browserTimelineDraftStore('user-a', doc.id); first.write(record);
    assert.equal(browserTimelineDraftStore('user-b', doc.id).read(), null);
    const second = browserTimelineDraftStore('user-a', doc.id); assert.equal(second.read()?.draft.name, 'Recovered');
    second.write(record); assert.equal(values.size, 1);
    first.write({ ...record, draft: { ...doc, name: 'Another tab' }, savedAt: 2 }); assert.equal(values.size, 2);
    assert.equal(second.read()?.draft.name, 'Recovered');
  } finally { Reflect.deleteProperty(globalThis, 'localStorage'); }
});

test('opening and leaving a fresh timeline creates neither a remote file nor a local journal', async () => {
  let writes = 0, creates = 0;
  const doc = original();
  const c = new TimelineAutosave({ store: { read: () => null, write: () => { writes++; } }, create: async (value) => { creates++; return value; }, save: async (value) => value, load: async () => doc });
  c.initialize(doc); c.stop(); await c.flush();
  assert.equal(c.getSnapshot().isNew, true); assert.equal(creates, 0); assert.equal(writes, 0);
});
test('the first edit creates once and later edits use revision-based saves', async () => {
  const doc = original(), calls: string[] = [];
  const c = new TimelineAutosave({ store: { read: () => null, write: () => {} }, create: async (value) => { calls.push('create'); return { ...value, revision: 0 }; }, save: async (value) => { calls.push(`save:${value.revision}`); return { ...value, revision: value.revision + 1 }; }, load: async () => doc });
  c.initialize(doc); c.stop(); c.edit({ ...doc, name: 'First edit' }); await c.flush();
  c.edit({ ...c.getSnapshot().draft!, name: 'Next edit' }); await c.flush();
  assert.deepEqual(calls, ['create', 'save:0']); assert.equal(c.getSnapshot().isNew, false);
});
test('a first chat forces creation once, even with simultaneous save requests', async () => {
  const doc = original(); let creates = 0;
  const c = new TimelineAutosave({ store: { read: () => null, write: () => {} }, create: async (value) => { creates++; return value; }, save: async (value) => value, load: async () => doc });
  c.initialize(doc); c.stop(); await Promise.all([c.flush(), c.flush(true), c.flush(true)]);
  assert.equal(creates, 1); assert.equal(c.getSnapshot().isNew, false);
});
test('retrying an uncertain first create retains its payload and then saves newer edits', async () => {
  const doc = original(), creates: TimelineDocument[] = [], updates: TimelineDocument[] = [];
  const c = new TimelineAutosave({ store: { read: () => null, write: () => {} }, create: async (value) => { creates.push(value); if (creates.length === 1) throw new TypeError('Response lost'); return { ...value, revision: 0 }; }, save: async (value) => { updates.push(value); return { ...value, revision: 1 }; }, load: async () => doc });
  c.initialize(doc); c.stop(); c.edit({ ...doc, name: 'First' }); await assert.rejects(c.flush());
  c.edit({ ...doc, name: 'Second' }); await c.flush();
  assert.equal(creates[0], creates[1]); assert.equal(updates[0].name, 'Second'); assert.equal(updates[0].revision, 0); assert.equal(c.getSnapshot().draft!.name, 'Second');
});
