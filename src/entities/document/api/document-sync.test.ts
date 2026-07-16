import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDocumentSyncFailure, createDebouncedAction } from './document-sync.ts';

test('debounced action keeps only the latest scheduled save', () => {
  const callbacks = new Map<number, () => void>();
  let nextHandle = 0;
  let calls = 0;
  const debounced = createDebouncedAction(() => { calls += 1; }, 800, {
    clear: (handle: number) => { callbacks.delete(handle); },
    set: (callback) => {
      nextHandle += 1;
      callbacks.set(nextHandle, callback);
      return nextHandle;
    },
  });

  debounced.schedule();
  debounced.schedule();

  assert.equal(callbacks.size, 1);
  assert.equal(debounced.pending, true);
  callbacks.values().next().value?.();
  assert.equal(calls, 1);
  assert.equal(debounced.pending, false);
});

test('flush saves immediately and cancel prevents a pending save', () => {
  const callbacks = new Map<number, () => void>();
  let calls = 0;
  const debounced = createDebouncedAction(() => { calls += 1; }, 800, {
    clear: (handle: number) => { callbacks.delete(handle); },
    set: (callback) => {
      callbacks.set(1, callback);
      return 1;
    },
  });

  debounced.schedule();
  debounced.flush();
  assert.equal(calls, 1);
  assert.equal(callbacks.size, 0);

  debounced.schedule();
  debounced.cancel();
  assert.equal(callbacks.size, 0);
  assert.equal(calls, 1);
});

test('revision conflict becomes a non-overwriting, actionable state', () => {
  const failure = classifyDocumentSyncFailure({
    status: 409,
    code: 'revision_conflict',
    details: { currentRevision: 7 },
  });

  assert.equal(failure.phase, 'conflict');
  assert.match(failure.message ?? '', /версии 7/);
  assert.match(failure.message ?? '', /не затереть/);
});

test('network failure keeps a recovery-oriented error message', () => {
  const failure = classifyDocumentSyncFailure(new TypeError('fetch failed'));

  assert.equal(failure.phase, 'error');
  assert.match(failure.message ?? '', /аварийной копии/);
});
